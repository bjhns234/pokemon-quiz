// The game's rules, driven through the same functions the buttons call. Each test
// starts a fresh game (first starter, not shiny) and sets up only what it checks.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,nextQuestion,serve,pinXp}=require('./helpers');

let errors;
test.beforeEach(async({page})=>{
  errors=await openGame(page);
  await startGame(page);
});
test.afterEach(()=>expect(errors,'uncaught page errors').toEqual([]));

const q=page=>state(page,()=>({text:st.q.question,answers:st.q.answers,key:reviewKey(st.q.tmpl),wrong:[...st.wrong]}));

test.describe('scoring',()=>{
  test('a first-try answer grows the streak and pays the streak ladder',async({page})=>{
    await pinXp(page);
    for(let n=1;n<=3;n++){
      await answer(page,true);
      expect(await state(page,()=>st.streak)).toBe(n);
      expect(await state(page,()=>st.lastXp)).toBe(await state(page,n=>xpForStreak(n),n));
      await nextQuestion(page);
    }
  });

  test('a miss resets the streak and keeps the same question until it is solved',async({page})=>{
    await pinXp(page);
    await state(page,()=>{st.streak=4;});
    const before=await q(page);
    await answer(page,false);
    expect(await state(page,()=>st.streak)).toBe(0);
    expect((await q(page)).text).toBe(before.text);
    await answer(page,true);
    expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>XP_AFTER_HINT));
    expect(await state(page,()=>st.streak)).toBe(0);
  });

  test('a tap during the arming pause is ignored',async({page})=>{
    await state(page,()=>{st.armAt=Date.now()+60000;handleAnswer(st.q.correctIndex);});
    expect(await state(page,()=>({tries:st.tries,cor:st.cor}))).toEqual({tries:0,cor:false});
  });

  test('streak milestones pay a bonus',async({page})=>{
    await pinXp(page);
    await state(page,()=>{st.streak=4;});
    await answer(page,true);
    const bonus=await state(page,()=>milestoneBonus(5));
    expect(bonus).toBeGreaterThan(0);
    expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>xpForStreak(5))+bonus);
    expect(await state(page,()=>st.streakMsg)).toContain('5 in a row');
  });

  test('shiny odds climb with the streak and stop at the cap',async({page})=>{
    const r=await state(page,()=>({base:SHINY_BASE_CHANCE,at0:shinyChance(0),at5:shinyChance(5),cap:shinyChance(SHINY_STREAK_CAP),past:shinyChance(SHINY_STREAK_CAP+20)}));
    expect(r.at0).toBe(r.base);
    expect(r.at5).toBeGreaterThan(r.at0);
    expect(r.cap).toBeGreaterThan(r.at5);
    expect(r.past).toBe(r.cap);
  });

  test('difficulty steps up after a run of first-try answers in a subject',async({page})=>{
    await state(page,()=>{st.stats.math.level=1;st.stats.math.cs=0;});
    const need=await state(page,()=>LEVEL_UP_STREAK);
    for(let i=0;i<need;i++){await serve(page,{sub:'math',lv:1,idx:i});await answer(page,true);}
    expect(await state(page,()=>st.stats.math.level)).toBe(2);
  });
});

test.describe('no free skips',()=>{
  test('changing subject keeps the open question; the new subject starts next',async({page})=>{
    await serve(page,{sub:'reading',lv:1,idx:0});
    const before=await q(page);
    await page.click('#subj-btn');
    await expect(page.locator('body')).toContainText('Starts after this question');
    await page.click('[data-subj="math"]');
    expect(await q(page)).toEqual(before);
    await answer(page,true);
    await nextQuestion(page);
    expect(await state(page,()=>st.q.subject)).toBe('math');
  });

  test('switching Pokemon keeps the question and redraws it with the new name',async({page})=>{
    await state(page,()=>{st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});});
    await serve(page,{sub:'reading'});
    await answer(page,false);
    const before=await q(page);
    const [oldName,newName]=await state(page,()=>[PKM[LINES[0][0]].n,PKM[LINES[1][0]].n]);
    expect(before.text).toContain(oldName);
    await page.click('#switch-btn');
    await page.click('[data-switch-idx="1"]');
    const after=await q(page);
    expect(after.key).toBe(before.key);
    expect(after.text).toBe(before.text.split(oldName).join(newName));
    expect(after.wrong).toEqual(before.wrong);
  });

  test('Switch is hidden while an evolution is waiting',async({page})=>{
    await state(page,()=>{st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});st.pendingEvo={fromPi:0,toPi:1};render();});
    await expect(page.locator('#switch-btn')).toHaveCount(0);
  });

  test('running from a wild Pokemon carries the open question back',async({page})=>{
    await state(page,()=>{st.cor=true;triggerWildEncounter(false);});
    const [wildKey,ownName]=await state(page,()=>[reviewKey(st.q.tmpl),PKM[activePi()].n]);
    await page.click('#flee');
    expect(await state(page,()=>st.phase)).toBe('play');
    expect((await q(page)).key).toBe(wildKey);
    const tmplHasP=await state(page,()=>st.q.tmpl.raw[0].includes('{P}'));
    if(tmplHasP)expect((await q(page)).text).toContain(ownName);
  });
});

test.describe('Ask for help',()=>{
  test('shows the hint before answering',async({page})=>{
    await state(page,()=>{st.armAt=0;render();});
    await page.click('#help-btn');
    const hint=await state(page,()=>st.q.hint);
    await expect(page.locator('.help-box')).toContainText(hint);
    await expect(page.locator('#help-btn')).toHaveCount(0);
  });

  test('landing it keeps the streak paused, pays the help rate, and rolls no encounter',async({page})=>{
    await pinXp(page);
    await state(page,()=>{st.streak=6;askForHelp();});
    await answer(page,true);
    expect(await state(page,()=>st.streak)).toBe(6);
    expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>XP_WITH_HELP));
    // Math.random pinned at 0 would trigger an encounter on any unhelped answer.
    await state(page,()=>{const r=Math.random;Math.random=()=>0;try{onNext();}finally{Math.random=r;}});
    expect(await state(page,()=>st.phase)).toBe('play');
  });

  test('without help the same roll does start an encounter',async({page})=>{
    await answer(page,true);
    await state(page,()=>{const r=Math.random;Math.random=()=>0;try{onNext();}finally{Math.random=r;}});
    expect(await state(page,()=>st.phase)).toBe('wild');
  });

  test('missing it after help resets the streak like any miss',async({page})=>{
    await state(page,()=>{st.streak=6;askForHelp();});
    await answer(page,false);
    expect(await state(page,()=>st.streak)).toBe(0);
  });

  test('help during an encounter fills no catch pip',async({page})=>{
    await state(page,()=>{st.cor=true;triggerWildEncounter(false);askForHelp();});
    await answer(page,true);
    expect(await state(page,()=>({cs:st.wild.correctStreak,misses:st.wild.misses}))).toEqual({cs:0,misses:0});
  });

  test('help does not count toward a difficulty step up',async({page})=>{
    await state(page,()=>{st.stats.math.level=1;st.stats.math.cs=0;});
    const need=await state(page,()=>LEVEL_UP_STREAK);
    for(let i=0;i<need;i++){
      await serve(page,{sub:'math',lv:1,idx:i});
      if(i===need-1)await state(page,()=>askForHelp());
      await answer(page,true);
    }
    expect(await state(page,()=>st.stats.math.level)).toBe(1);
  });
});

test.describe('Rematches',()=>{
  test('a missed question comes back after the gap, and two clean wins retire it',async({page})=>{
    await pinXp(page);
    const addr=await serve(page,{sub:'math',lv:1,idx:0});
    const key=`math/1/0`;
    await answer(page,false);
    const gap=await state(page,()=>REVIEW.gap);
    for(let i=1;i<gap;i++){
      await answer(page,true);await nextQuestion(page);
      expect(await state(page,()=>!!st.q.rematch),`too early at ${i}`).toBe(false);
    }
    await answer(page,true);await nextQuestion(page);
    expect(await state(page,()=>[!!st.q.rematch,reviewKey(st.q.tmpl)])).toEqual([true,key]);
    await expect(page.locator('.rematch-pill')).toBeVisible();

    await state(page,()=>{st.streak=0;});
    await answer(page,true);
    const bonus=await state(page,()=>REVIEW.bonus);
    expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>xpForStreak(1))+bonus);
    await expect(page.locator('.rematch-toast')).toBeVisible();
    const r=await state(page,k=>{const e=st.review.find(x=>reviewKey(x)===k);return {wins:e.wins,due:e.due-st.served};},key);
    expect(r).toEqual({wins:1,due:await state(page,()=>REVIEW.long)});

    // Second clean win (served directly: waiting out REVIEW.long adds nothing).
    await serve(page,addr);
    await answer(page,true);
    expect(await state(page,k=>st.review.some(x=>reviewKey(x)===k),key)).toBe(false);
  });

  test('needing help queues a question too, and resets its wins',async({page})=>{
    await serve(page,{sub:'math',lv:1,idx:0});
    await state(page,()=>askForHelp());
    await answer(page,true);
    expect(await state(page,()=>st.review.map(reviewKey))).toEqual(['math/1/0']);
    await state(page,()=>{st.review[0].wins=1;});
    await serve(page,{sub:'math',lv:1,idx:0});
    await state(page,()=>askForHelp());
    await answer(page,true);
    expect(await state(page,()=>st.review[0].wins)).toBe(0);
  });

  test('a single-subject choice holds back Rematches from other subjects',async({page})=>{
    await state(page,()=>{st.subject='math';st.review=[{sub:'reading',lv:1,idx:0,wins:0,due:0}];});
    for(let i=0;i<5;i++){await nextQuestion(page);expect(await state(page,()=>st.q.subject)).toBe('math');}
    await state(page,()=>{st.subject=SUBJ_MIX;});
    await nextQuestion(page);
    expect(await state(page,()=>reviewKey(st.q.tmpl))).toBe('reading/1/0');
  });
});

test.describe('saving',()=>{
  test('progress and Rematches survive a reload',async({page})=>{
    await serve(page,{sub:'math',lv:1,idx:0});
    await answer(page,false);
    await state(page,()=>{st.bestStreak=7;save();});
    await page.reload();
    const s=await state(page,()=>({phase:st.phase,team:st.team.length,best:st.bestStreak,review:st.review.map(reviewKey),due:st.review.map(r=>r.due)}));
    expect(s).toEqual({phase:'play',team:1,best:7,review:['math/1/0'],due:[2]});
  });
});
