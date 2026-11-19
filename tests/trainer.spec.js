// Trainer battles replace the 7+ bonus catch on finished rounds 2, 5, 8, …
// The foe cannot be caught. A miss does not ask the question again.
const {test,expect}=require('@playwright/test');
const fs=require('fs');
const {openGame,startGame,state,answer}=require('./helpers');

const ART='/opt/cursor/artifacts';

async function boot(page){
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    activeKid().name='Simon';
    const tm=activeTM();
    tm.level=60;tm.xp=-8000;st.pendingEvo=null;
    Math.random=()=>0.99;
    save();
  });
  return errors;
}

// `done` is how many rounds this child has already finished. One more clean
// answer closes a round that already has 6 right, so the line of 7 is met.
async function closeQualified(page,done){
  await state(page,done=>{
    st.roundsDone=done|0;
    const finish=(done|0)+1;
    const trainerFinish=finish>=2&&((finish-2)%3)===0;
    if(!st.route)st.route={tier:1,step:0};
    st.route.tier=1;
    st.route.debut=false;
    st.route.announce=null;
    if(trainerFinish){
      const which=(finish-2)/3;
      st.route.step=which%2===0?1:4;
    }else{
      st.route.step=0;
    }
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=6;
    st.round.marks=[1,1,1,1,1,1,0,0,0];
    st.streak=0;
    st.review=[];
    st.pendingEvo=null;
    st.bonusWild=false;
    st.wild=null;
    st.wildEscape=false;
    if(st.phase!=='play')st.phase='play';
    st.cor=false;st.tries=0;st.wrong=[];st.helped=false;
    Math.random=()=>0.99;
  },done);
  await answer(page,true);
}

async function openBattle(page,done){
  await closeQualified(page,done==null?1:done);
  await expect(page.locator('#trainer-go')).toBeVisible();
  await page.click('#trainer-go');
  await expect(page.locator('.qtext')).toBeVisible();
}

test('finished rounds 2, 5, and 8 are the trainer rounds',async({page})=>{
  const errors=await boot(page);
  const flags=await state(page,()=>{
    const out=[];
    st.route={tier:1,step:0};
    st.badges.math=[];
    st.gymOffer.math=null;
    st.log={};
    for(let s=0;s<=6;s++){st.route.step=s;out.push(!!trainerBattleDue());}
    return out;
  });
  expect(flags).toEqual([false,false,true,false,false,true,true]);
  expect(await state(page,()=>routeTrainers().map(t=>t.id))).toEqual(['joey','mia','sam','ben','liz']);
  expect(await state(page,()=>TRAINERS.some(t=>t.id==='kim'&&t.door))).toBe(true);

  await closeQualified(page,0);
  await expect(page.locator('.wild-card')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await state(page,()=>st.roundsDone)).toBe(1);

  await state(page,()=>{st.wild=null;st.bonusWild=false;st.phase='play';return loadQuestion();});
  await closeQualified(page,1);
  await expect(page.locator('#trainer-card')).toBeVisible();
  await expect(page.locator('.wild-card')).toHaveCount(0);
  expect(await state(page,()=>st.roundsDone)).toBe(2);
  await expect(page.locator('#trainer-card')).toContainText('Youngster Joey wants to battle!');
  await expect(page.locator('#trainer-card')).toContainText('Joey sends out Rattata!');
  await expect(page.locator('#trainer-card')).toContainText('Get 2 hits to win.');

  await state(page,()=>{st.trainer=null;st.phase='play';return loadQuestion();});
  await closeQualified(page,2);
  await expect(page.locator('.wild-card')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);

  await state(page,()=>{st.wild=null;st.bonusWild=false;st.phase='play';return loadQuestion();});
  await closeQualified(page,4);
  await expect(page.locator('#trainer-card')).toContainText('Lass Mia wants to battle!');
  expect(await state(page,()=>st.trainer.id)).toBe('mia');

  await state(page,()=>{st.trainer=null;st.phase='play';return loadQuestion();});
  await closeQualified(page,7);
  await expect(page.locator('#trainer-go')).toBeVisible();
  expect(await state(page,()=>st.roundsDone)).toBe(8);
  expect(await state(page,()=>st.phase)).toBe('trainer');
  expect(errors).toEqual([]);
});

test('two hits win on question 2, and the prize is XP plus a star',async({page})=>{
  const errors=await boot(page);
  const items=await state(page,()=>({candy:st.items.candy,great:st.items.great}));
  await openBattle(page,1);
  await expect(page.locator('#trainer-card')).toContainText('Trainer Battle');
  await expect(page.locator('#trainer-q')).toHaveText('Question 1 of 3');
  await expect(page.locator('#trainer-mon')).toHaveText("Joey's Rattata");
  await state(page,()=>{st.streak=0;});
  const before=await state(page,()=>activeTM().xp);
  await answer(page,true);
  const afterHit=await state(page,()=>activeTM().xp);
  const firstPay=await state(page,()=>xpForStreak(1)+milestoneBonus(1));
  expect(afterHit-before).toBe(firstPay);
  await expect(page.locator('#trainer-hit')).toHaveText('Hit!');
  await expect(page.locator('#trainer-q')).toHaveText('Question 2 of 3');
  expect(await state(page,()=>st.trainer.hits)).toBe(1);
  await expect(page.locator('#trainer-hp')).toHaveAttribute('data-hp','1');
  await answer(page,true);
  const afterWin=await state(page,()=>activeTM().xp);
  const secondPay=await state(page,()=>xpForStreak(2)+milestoneBonus(2));
  expect(afterWin-afterHit-30).toBe(secondPay);
  await expect(page.locator('#trainer-result')).toContainText('You beat Youngster Joey!');
  await expect(page.locator('#trainer-result')).toContainText('Rattata is all tired out. Great math!');
  await expect(page.locator('#trainer-result')).toContainText('+30 XP');
  await expect(page.locator('#trainer-result')).toContainText('Trainer star on your map');
  await expect(page.getByRole('button',{name:'See your map'})).toBeVisible();
  expect(await state(page,()=>st.trainerStars)).toEqual(['joey']);
  expect(await state(page,()=>activeTM().xp)).toBe(afterWin);
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Rattata'))).toBe(false);
  expect(await state(page,()=>({candy:st.items.candy,great:st.items.great}))).toEqual(items);
  const left=await state(page,()=>st.armAt-Date.now());
  expect(left).toBeGreaterThan(500);
  expect(left).toBeLessThanOrEqual(800);
  await page.click('#trainer-map');
  expect(await state(page,()=>st.phase)).toBe('trainer');
  await state(page,()=>{st.armAt=0;});
  await page.click('#trainer-map');
  await expect(page.locator('#round-done')).toBeVisible();
  expect(await state(page,()=>st.round.n)).toBe(10);
  const roundXp=await state(page,()=>st.round.xp|0);
  await expect(page.locator('#round-xp')).toHaveText(`+${roundXp} XP`);
  const shown=await page.locator('.round-mark').allTextContents();
  const order=await state(page,()=>st.round.marks.map(m=>m?'✓':'○'));
  expect(shown.map(s=>s.trim())).toEqual(order);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data);
  expect(saved.v).toBe(1);
  expect(saved.trainerStars).toEqual(['joey']);
  expect(saved.roundsDone).toBe(2);
  expect(errors).toEqual([]);
});

test('a hit, a miss, and a hit wins on question 3',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  await answer(page,true);
  await answer(page,false);
  await expect(page.locator('#trainer-praise')).toHaveText("You kept trying. That's how trainers get strong!");
  await page.click('#trainer-next');
  await expect(page.locator('#trainer-q')).toHaveText('Question 3 of 3');
  expect(await state(page,()=>st.trainer.hits)).toBe(1);
  await answer(page,true);
  await expect(page.locator('#trainer-result')).toContainText('You beat Youngster Joey!');
  expect(await state(page,()=>st.trainer.hits)).toBe(2);
  expect(errors).toEqual([]);
});

test('a miss shows that question\'s worked answer and cannot be tried again',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  await state(page,()=>{
    const idx=QB.math[1].findIndex(q=>q[0]==='What is 2 + 3?');
    st.q=serveQuestion('math',1,idx,questionPname());
    st.tries=0;st.cor=false;st.helped=false;st.wrong=[];st.armAt=0;
    render();
  });
  await answer(page,false);
  await expect(page.locator('#trainer-worked')).toHaveText('Good try! 2 + 3 = 5.');
  await page.click('#trainer-next');
  await state(page,()=>{
    const idx=QB.math[1].findIndex(q=>q[0].includes('berries and ate'));
    st.q=serveQuestion('math',1,idx,questionPname());
    st.tries=0;st.cor=false;st.helped=false;st.wrong=[];st.armAt=0;
    st.trainer.miss=false;
    render();
  });
  await answer(page,false);
  await expect(page.locator('#trainer-worked')).toHaveText('Good try! The answer is 2.');
  await expect(page.locator('#trainer-praise')).toHaveText("You kept trying. That's how trainers get strong!");
  await expect(page.locator('#trainer-next')).toHaveText('Next');
  const tries=await state(page,()=>st.tries);
  await page.locator('.ans-btn').first().click({force:true});
  expect(await state(page,()=>st.tries)).toBe(tries);
  expect(await state(page,()=>st.trainer.hits)).toBe(0);
  expect(errors).toEqual([]);
});

test('help then a right answer is a hit, and the picture hint is allowed',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  await state(page,()=>{
    const idx=QB.math[1].findIndex(q=>q[0]==='What is 2 + 3?');
    st.q=serveQuestion('math',1,idx,questionPname());
    st.tries=0;st.cor=false;st.helped=false;st.wrong=[];st.armAt=0;
    render();
  });
  await state(page,()=>askForHelp());
  await expect(page.locator('.help-box')).toBeVisible();
  for(const size of [{width:768,height:1024},{width:390,height:844}]){
    await page.setViewportSize(size);
    const small=await page.evaluate(()=>{
      const root=document.getElementById('game');
      const out=[];
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let node;const seen=new Set();
      while((node=walker.nextNode())){
        if(!node.textContent||!node.textContent.trim())continue;
        const el=node.parentElement;
        if(!el||seen.has(el)||el.closest('.hdr'))continue;
        seen.add(el);
        const s=getComputedStyle(el);
        if(s.display==='none'||s.visibility==='hidden')continue;
        const r=el.getBoundingClientRect();
        if(r.width<2||r.height<2)continue;
        const px=parseFloat(s.fontSize);
        if(px<18)out.push(node.textContent.trim().slice(0,24)+' '+px);
      }
      return out;
    });
    expect(small,`${size.width}x${size.height}`).toEqual([]);
  }
  await page.setViewportSize({width:768,height:1024});
  await expect(page.locator('.hint-visual')).toBeVisible();
  await expect(page.locator('.gym-time')).toHaveCount(0);
  await answer(page,true);
  expect(await state(page,()=>st.trainer.hits)).toBe(1);
  await expect(page.locator('#trainer-hit')).toBeVisible();
  expect(errors).toEqual([]);
});

test('three questions without two hits lets the Pokémon get away',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  await state(page,()=>{st.streak=0;});
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await expect(page.locator('#trainer-result')).toContainText('Rattata ran back to Joey.');
  await expect(page.locator('#trainer-result')).toContainText('Nice try!');
  await expect(page.locator('#trainer-result')).not.toContainText('0 hits');
  await expect(page.locator('#trainer-result')).toContainText('Every try makes you stronger.');
  await expect(page.locator('#trainer-xp')).toHaveCount(0);
  expect(await state(page,()=>st.trainerStars||[])).toEqual([]);
  await expect(page.getByRole('button',{name:'See your map'})).toBeVisible();
  await expect(page.getByRole('button',{name:/rematch|battle again/i})).toHaveCount(0);

  await state(page,()=>{st.trainer=null;st.phase='play';st.roundsDone=1;return loadQuestion();});
  await openBattle(page,1);
  await state(page,()=>{st.streak=0;});
  await answer(page,true);
  const gained=await state(page,()=>st.trainer.gained);
  expect(gained).toBeGreaterThan(0);
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await expect(page.locator('#trainer-result')).toContainText('Nice try! You got 1 hit.');
  await expect(page.locator('#trainer-result')).toContainText(`+${gained} XP`);
  await expect(page.locator('#trainer-result')).not.toContainText('+30 XP');
  expect(await state(page,()=>st.trainerStars||[])).toEqual([]);
  expect(errors).toEqual([]);
});

test('a trainer round battles instead of the bonus catch',async({page})=>{
  const errors=await boot(page);
  await closeQualified(page,1);
  await expect(page.locator('#trainer-go')).toBeVisible();
  await expect(page.locator('.wild-card')).toHaveCount(0);
  expect(await state(page,()=>st.bonusWild)).toBe(false);
  expect(await state(page,()=>st.phase)).toBe('trainer');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data);
  expect(saved.roundsDone).toBe(2);
  expect(saved.trainer.id).toBe('joey');
  expect(saved.v).toBe(1);
  expect(errors).toEqual([]);
});

test('a round that is not a trainer round still offers the bonus catch',async({page})=>{
  const errors=await boot(page);
  await closeQualified(page,0);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await state(page,()=>st.phase)).toBe('wild');

  await state(page,()=>{st.wild=null;st.bonusWild=false;st.phase='play';return loadQuestion();});
  await closeQualified(page,2);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a Gym award ends the round with no battle',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.roundsDone=1;
    st.round.n=8;
    st.round.right=8;
    st.gymOffer.math={tier:1,cool:0};
    st.stats.math.level=1;
    st.badges.math=[];
    st.cor=true;
    st.phase='play';
    render();
  });
  await page.click('[data-gym-start="math"]');
  expect(await state(page,()=>st.phase)).toBe('gym');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await expect(page.locator('.award-card')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await state(page,()=>st.phase)).toBe('award');
  expect(await state(page,()=>st.roundsDone)).toBe(2);
  expect(await state(page,()=>st.trainer)).toBe(null);
  expect(errors).toEqual([]);
});

test('an evolution from the last question plays before the battle',async({page})=>{
  test.setTimeout(40000);
  const errors=await boot(page);
  await state(page,()=>{
    const tm=activeTM();
    tm.pi=0;tm.level=15;tm.xp=xpToNext(15)-5;tm.shiny=false;
    st.pendingEvo=null;st.streak=0;st.roundsDone=1;
    st.route={tier:1,step:1};
    st.round=freshRound(10);
    st.round.n=9;st.round.right=8;st.round.marks=Array(9).fill(1);
    Math.random=()=>0.99;
  });
  await answer(page,true);
  await expect(page.locator('#nxt')).toContainText('What\'s happening');
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  await page.click('#nxt');
  await expect(page.locator('#evo-overlay.active')).toBeVisible();
  await expect.poll(()=>page.locator('#trainer-go').count(),{timeout:25000}).toBe(1);
  expect(await state(page,()=>PKM[activeTM().pi].n)).toBe('Ivysaur');
  expect(errors).toEqual([]);
});

test('an evolution earned in the battle plays after it, before round done',async({page})=>{
  test.setTimeout(40000);
  const errors=await boot(page);
  await state(page,()=>{
    const tm=activeTM();
    tm.pi=0;tm.level=15;tm.xp=xpToNext(15)-16;tm.shiny=false;
    st.pendingEvo=null;st.streak=0;
  });
  await openBattle(page,1);
  expect(await state(page,()=>st.pendingEvo)).toBe(null);
  await answer(page,true);
  expect(await state(page,()=>!!st.pendingEvo)).toBe(true);
  await expect(page.locator('#evo-overlay.active')).toHaveCount(0);
  await expect(page.locator('#trainer-q')).toHaveText('Question 2 of 3');
  await answer(page,true);
  await expect(page.locator('#trainer-result')).toBeVisible();
  await expect(page.locator('#evo-overlay.active')).toHaveCount(0);
  expect(await state(page,()=>PKM[activeTM().pi].n)).toBe('Bulbasaur');
  await state(page,()=>{st.armAt=0;});
  await page.click('#trainer-map');
  await expect(page.locator('#evo-overlay.active')).toBeVisible();
  await expect.poll(()=>state(page,()=>st.phase),{timeout:25000}).toBe('round');
  expect(await state(page,()=>PKM[activeTM().pi].n)).toBe('Ivysaur');
  await expect(page.locator('#round-done')).toBeVisible();
  expect(errors).toEqual([]);
});

test('banked battle XP levels the new form, not the one waiting to evolve',async({page})=>{
  test.setTimeout(40000);
  const errors=await boot(page);
  await openBattle(page,1);
  await state(page,()=>{
    const tm=activeTM();
    tm.pi=0;tm.level=15;tm.shiny=false;
    tm.xp=xpToNext(15)-1;
    st.streak=6;
    st.pendingEvo=null;
  });
  await answer(page,true);
  const queued=await state(page,()=>({
    name:PKM[activeTM().pi].n,
    level:activeTM().level,
    pending:!!st.pendingEvo,
  }));
  expect(queued).toEqual({name:'Bulbasaur',level:16,pending:true});
  await answer(page,true);
  expect(await state(page,()=>({name:PKM[activeTM().pi].n,level:activeTM().level}))).toEqual({name:'Bulbasaur',level:16});
  await expect(page.locator('#trainer-result')).toBeVisible();
  await state(page,()=>{st.armAt=0;});
  await page.click('#trainer-map');
  await expect.poll(()=>state(page,()=>({name:PKM[activeTM().pi].n,level:activeTM().level})),{timeout:25000}).toEqual({name:'Ivysaur',level:17});
  const after=await state(page,()=>{
    const tm=activeTM();
    const banked=(xpToNext(15)-1)+45+45+30-xpToNext(15);
    return {level:tm.level,xp:tm.xp,want:banked-xpToNext(16)};
  });
  expect(after.level).toBe(17);
  expect(after.xp).toBe(after.want);
  expect(errors).toEqual([]);
});

test('a round-ending wild evolves before that wild fight continues',async({page})=>{
  test.setTimeout(40000);
  const errors=await boot(page);
  await state(page,()=>{
    const tm=activeTM();
    tm.pi=0;tm.level=15;tm.xp=xpToNext(15)-10;tm.shiny=false;
    st.pendingEvo=null;st.streak=4;st.roundsDone=1;
    st.route={tier:1,step:1};
    st.round=freshRound(10);
    st.round.n=9;st.round.right=8;st.round.marks=Array(9).fill(1);
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild={pi,level:6,shiny:false,correctStreak:1,misses:0};
    st.phase='wild';
    Math.random=()=>0.99;
    return loadQuestion();
  });
  const asked=await page.locator('.qtext').innerText();
  await answer(page,true);
  await expect(page.locator('#nxt')).toContainText('What\'s happening');
  expect(await state(page,()=>st.phase)).toBe('play');
  expect(await state(page,()=>({evo:!!st.pendingEvo,wild:!!(st.round&&st.round.holdWild),name:st.wild&&PKM[st.wild.pi].n}))).toEqual({
    evo:true,wild:true,name:'Pidgey',
  });
  await page.click('#nxt');
  await expect(page.locator('#evo-overlay.active')).toBeVisible();
  await expect.poll(()=>state(page,()=>st.phase),{timeout:25000}).toBe('wild');
  expect(await state(page,()=>PKM[activeTM().pi].n)).toBe('Ivysaur');
  expect(await state(page,()=>st.wild&&PKM[st.wild.pi].n)).toBe('Pidgey');
  expect(await state(page,()=>st.wild.correctStreak)).toBe(2);
  expect(await page.locator('.qtext').innerText()).toBe(asked);
  await expect(page.locator('#trainer-go')).toHaveCount(0);
  await page.click('#flee');
  await expect(page.locator('#trainer-go')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a wild already out finishes before the trainer battle',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.roundsDone=1;
    st.route={tier:1,step:1};
    st.round=freshRound(10);
    st.round.n=9;st.round.right=8;st.round.marks=Array(9).fill(1);
    st.streak=0;st.pendingEvo=null;
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild={pi,level:6,shiny:false,correctStreak:0,misses:0};
    st.phase='wild';
    return loadQuestion();
  });
  await answer(page,true);
  expect(await state(page,()=>st.phase)).toBe('wild');
  expect(await state(page,()=>st.round.holdWild)).toBe(true);
  await page.click('#flee');
  await expect(page.locator('#trainer-go')).toBeVisible();
  expect(await state(page,()=>st.wild)).toBe(null);
  await expect(page.locator('.wild-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reload mid-battle resumes the same trainer, hits, and question',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  const first=await page.locator('.qtext').innerText();
  await answer(page,true);
  const second=await page.locator('.qtext').innerText();
  expect(second).not.toBe(first);
  await state(page,()=>askForHelp());
  const answers=await state(page,()=>st.q.answers.slice());
  expect(await state(page,()=>st.helped)).toBe(true);
  expect(await state(page,()=>({id:st.trainer.id,hits:st.trainer.hits,qn:st.trainer.qn}))).toEqual({id:'joey',hits:1,qn:2});
  await page.reload();
  await expect(page.locator('#trainer-q')).toHaveText('Question 2 of 3');
  await expect(page.locator('#trainer-mon')).toHaveText("Joey's Rattata");
  await expect(page.locator('.qtext')).toHaveText(second);
  expect(await state(page,()=>st.q.answers.slice())).toEqual(answers);
  await expect(page.locator('.help-box')).toBeVisible();
  expect(await state(page,()=>({phase:st.phase,id:st.trainer.id,hits:st.trainer.hits,qn:st.trainer.qn}))).toEqual({
    phase:'trainer',id:'joey',hits:1,qn:2,
  });
  await answer(page,true);
  await expect(page.locator('#trainer-result')).toContainText('You beat Youngster Joey!');
  expect(errors).toEqual([]);
});

test('no wild Pokémon shows up during a battle',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  await state(page,()=>{Math.random=()=>0;});
  await answer(page,true);
  expect(await state(page,()=>({phase:st.phase,wild:st.wild}))).toEqual({phase:'trainer',wild:null});
  await answer(page,true);
  await expect(page.locator('.wild-card')).toHaveCount(0);
  expect(await state(page,()=>st.phase)).toBe('trainer');
  expect(errors).toEqual([]);
});

test('battle answers add no round marks, and they do count on the mastery tape',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  const marks=await state(page,()=>st.round.marks.slice());
  const n=await state(page,()=>st.round.n);
  expect(marks).toHaveLength(10);
  const before=await state(page,()=>{
    const day=localISO(new Date());
    return (st.log[day]&&st.log[day]['math|@|1'])||'';
  });
  await answer(page,true);
  const after=await state(page,()=>{
    const day=localISO(new Date());
    return (st.log[day]&&st.log[day]['math|@|1'])||'';
  });
  expect(after).toBe(before+'1');
  expect(await state(page,()=>st.round.marks)).toEqual(marks);
  expect(await state(page,()=>st.round.n)).toBe(n);
  await answer(page,false);
  const missed=await state(page,()=>{
    const day=localISO(new Date());
    return (st.log[day]&&st.log[day]['math|@|1'])||'';
  });
  expect(missed).toBe(after+'0');
  expect(await state(page,()=>st.round.marks)).toEqual(marks);
  expect(errors).toEqual([]);
});

test('a warm-up in progress deals those questions and hides the Warm-up tag',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=2;
    st.badges.math=[1];
    st.log={'2026-11-17':{'math|@|1':'1'.repeat(20)},'2026-11-18':{'math|@|1':'1'.repeat(20)}};
    st.warmup={sub:'math',home:2,tier:1,topic:'Adding',queue:[0,1,2],at:0};
    st.stats.math.ws=0;
  });
  await openBattle(page,1);
  expect(await state(page,()=>!!st.q.warmup)).toBe(true);
  await expect(page.locator('.warmup-tag')).toHaveCount(0);
  await expect(page.locator('.warmup-say')).toHaveCount(0);
  const at=await state(page,()=>st.warmup.at);
  await answer(page,true);
  expect(await state(page,()=>st.warmup&&st.warmup.at)).toBe(at+1);
  expect(errors).toEqual([]);
});

test('a battle miss on this tier can start the warm-up',async({page})=>{
  const errors=await boot(page);
  await openBattle(page,1);
  await state(page,()=>{st.stats.math.ws=2;st.stats.math.level=1;st.warmup=null;});
  await answer(page,false);
  expect(await state(page,()=>!!st.warmup)).toBe(true);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  expect(errors).toEqual([]);
});

test('the battle uses the same review mix as practice',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=2;
    st.badges.math=[1];
    st.reviewCount.math=4;
    st.review=[];
    st.warmup=null;
    st.log={'2026-11-17':{'math|@|1':'1'.repeat(20)},'2026-11-18':{'math|@|1':'1'.repeat(20)}};
  });
  await openBattle(page,1);
  expect(await state(page,()=>!!st.q.bankReview)).toBe(true);
  expect(errors).toEqual([]);
});

test('Reduce Motion keeps the battle still and the Hit tag visible',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=await boot(page);
  await openBattle(page,1);
  await answer(page,true);
  await expect(page.locator('#trainer-hit')).toBeVisible();
  const motion=await page.evaluate(()=>{
    const foe=document.querySelector('.trainer-foe');
    const bar=document.querySelector('.hp-fill');
    const tag=document.getElementById('trainer-hit');
    const foeCs=getComputedStyle(foe);
    const barCs=getComputedStyle(bar);
    const tagCs=getComputedStyle(tag);
    return {
      foe:foeCs.animationName,
      bar:barCs.transitionDuration,
      tagAnim:tagCs.animationName,
      tag:tag.textContent,
    };
  });
  expect(motion.foe).toBe('none');
  expect(motion.bar==='0s'||motion.bar==='0ms').toBe(true);
  expect(motion.tagAnim).toBe('none');
  expect(motion.tag).toBe('Hit!');
  expect(errors).toEqual([]);
});

test('an old save without the new fields loads and still saves as version 1',async({page})=>{
  const save={
    v:1,roster:1,activeId:'simon',
    kids:[{
      id:'simon',name:'Simon',avatar:'#001',
      data:{
        v:1,starter:0,activeIdx:0,
        team:[{num:'#001',level:8,xp:10}],
        dex:['#001'],
        subject:'math',
        stats:{
          math:{cor:4,att:4,level:1,cs:0,ws:0},
          reading:{cor:0,att:0,level:1,cs:0,ws:0},
          science:{cor:0,att:0,level:1,cs:0,ws:0},
        },
        badges:{math:[],reading:[],science:[]},
        items:{candy:1,great:2},
      },
    }],
  };
  const errors=await openGame(page,{save});
  expect(await state(page,()=>({
    phase:st.phase,
    mon:PKM[activeTM().pi].n,
    level:activeTM().level,
    xp:activeTM().xp,
    candy:st.items.candy,
    great:st.items.great,
    v:SAVE_V,
    done:st.roundsDone|0,
    stars:(st.trainerStars||[]).slice(),
    trainer:st.trainer||null,
  }))).toEqual({
    phase:'play',mon:'Bulbasaur',level:8,xp:10,candy:1,great:2,
    v:1,done:0,stars:[],trainer:null,
  });
  await answer(page,true);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')));
  expect(stored.v).toBe(1);
  expect(stored.kids[0].data.v).toBe(1);
  expect(stored.kids[0].data.team[0].num).toBe('#001');
  expect(stored.kids[0].data.roundsDone).toBeUndefined();
  expect(stored.kids[0].data.trainerStars).toBeUndefined();
  expect(stored.kids[0].data.trainer).toBeUndefined();
  expect(errors).toEqual([]);
});

async function missScreen(page){
  await openBattle(page,1);
  await state(page,()=>{
    const idx=QB.math[1].findIndex(q=>q[0].startsWith('Which holds'));
    st.q=serveQuestion('math',1,idx,questionPname());
    st.tries=0;st.cor=false;st.helped=false;st.wrong=[];st.armAt=0;
    render();
  });
  await answer(page,false);
  await expect(page.locator('#trainer-next')).toBeVisible();
}

test('a miss keeps Next on screen in landscape',async({page})=>{
  const errors=await boot(page);
  await missScreen(page);
  const sizes=[
    {width:768,height:1024},
    {width:1024,height:768},
    {width:1194,height:834},
    {width:1133,height:744},
    {width:390,height:844},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    const fit=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      const next=document.getElementById('trainer-next').getBoundingClientRect();
      const nav=document.getElementById('bottom-nav').getBoundingClientRect();
      const answers=[...document.querySelectorAll('.ans-btn')].map(el=>el.getBoundingClientRect());
      const q=document.querySelector('.qtext').getBoundingClientRect();
      return {
        scroll:main.scrollHeight-main.clientHeight,
        nextTop:next.top,
        nextBottom:next.bottom,
        navTop:nav.top,
        answers:answers.length,
        answerBottom:answers.reduce((m,r)=>Math.max(m,r.bottom),0),
        qTop:q.top,
      };
    });
    const where=`${size.width}x${size.height}`;
    expect(fit.scroll,where).toBeLessThanOrEqual(1);
    expect(fit.answers,where).toBe(4);
    await expect(page.locator('.ans-btn.cor'),where).toBeVisible();
    expect(fit.qTop,where).toBeGreaterThanOrEqual(0);
    expect(fit.answerBottom,where).toBeLessThanOrEqual(fit.navTop+0.5);
    expect(fit.nextTop,where).toBeGreaterThanOrEqual(0);
    expect(fit.nextBottom,where).toBeLessThanOrEqual(fit.navTop+0.5);
  }
  expect(errors).toEqual([]);
});

test('battle answers are as tall as the tablet question buttons',async({page})=>{
  const errors=await boot(page);
  await missScreen(page);
  const sizes=[
    {width:768,height:1024,min:88,max:104},
    {width:1024,height:768,min:88,max:104},
    {width:390,height:844,min:64,max:88},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    const box=await page.locator('.ans-btn').first().boundingBox();
    const font=await page.locator('.ans-btn').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    const where=`${size.width}x${size.height}`;
    expect(box.height,where).toBeGreaterThanOrEqual(size.min);
    expect(box.height,where).toBeLessThanOrEqual(size.max);
    expect(font,where).toBe(20);
  }
  expect(errors).toEqual([]);
});

test('a hit sits beside the partner, and a miss turns its dot grey',async({page})=>{
  const errors=await boot(page);
  await closeQualified(page,1);
  await expect(page.locator('#trainer-card .trainer-icon')).toBeVisible();
  await page.click('#trainer-go');
  await answer(page,true);
  await expect(page.locator('.trainer-partner #trainer-hit')).toBeVisible();
  await expect(page.locator('#trainer-card .trainer-icon')).toHaveCount(0);
  await expect(page.locator('.trainer-top #trainer-hit')).toHaveCount(0);
  let marks=await page.locator('.trainer-dot').evaluateAll(els=>els.map(el=>el.dataset.mark));
  expect(marks).toEqual(['hit','open','open']);
  const align=await page.locator('.qtext').evaluate(el=>getComputedStyle(el).textAlign);
  expect(align).toBe('center');
  await answer(page,false);
  await expect(page.locator('#trainer-card .trainer-icon')).toHaveCount(0);
  marks=await page.locator('.trainer-dot').evaluateAll(els=>els.map(el=>el.dataset.mark));
  expect(marks).toEqual(['hit','miss','open']);
  const colors=await page.locator('.trainer-dot').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));
  expect(colors[0]).not.toBe(colors[1]);
  expect(colors[1]).not.toBe(colors[2]);
  expect(errors).toEqual([]);
});

test('a hit keeps Hit! beside the partner on a short landscape screen',async({page})=>{
  const errors=await boot(page);
  await closeQualified(page,1);
  await page.click('#trainer-go');
  await answer(page,true);
  await expect(page.locator('#trainer-hit')).toBeVisible();
  await state(page,()=>{st.armAt=0;render();});
  for(const size of [{width:1024,height:768},{width:1133,height:744}]){
    await page.setViewportSize(size);
    const where=`${size.width}x${size.height}`;
    await expect(page.locator('.trainer-partner #trainer-hit'),where).toBeVisible();
    const scroll=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      return main.scrollHeight-main.clientHeight;
    });
    expect(scroll,where).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('trainer battle screens fit an iPad and a phone',async({page})=>{
  test.setTimeout(180000);
  const errors=await boot(page);
  fs.mkdirSync(ART,{recursive:true});
  const sizes=[{width:768,height:1024},{width:1024,height:768},{width:390,height:844}];

  async function shot(name){
    for(const size of sizes){
      await page.setViewportSize(size);
      const where=`${name} ${size.width}x${size.height}`;
      const fit=await page.evaluate(()=>{
        const main=document.getElementById('app-main');
        const root=document.getElementById('game');
        const small=[];
        if(root){
          const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
          let node;const seen=new Set();
          while((node=walker.nextNode())){
            if(!node.textContent||!node.textContent.trim())continue;
            const el=node.parentElement;
            if(!el||seen.has(el)||el.closest('.hdr'))continue;
            seen.add(el);
            const s=getComputedStyle(el);
            if(s.display==='none'||s.visibility==='hidden')continue;
            const r=el.getBoundingClientRect();
            if(r.width<2||r.height<2)continue;
            const sizePx=parseFloat(s.fontSize);
            if(sizePx<18)small.push(node.textContent.trim().slice(0,24)+' '+sizePx);
          }
        }
        const next=document.getElementById('trainer-next');
        const nr=next?next.getBoundingClientRect():null;
        const nav=document.getElementById('bottom-nav').getBoundingClientRect();
        return {
          scroll:main.scrollHeight-main.clientHeight,
          small,
          next:nr?nr.top>=0&&nr.bottom<=nav.top+0.5:false,
          hasNext:!!next,
        };
      });
      if(!String(name).includes('round_done'))expect(fit.small,where).toEqual([]);
      if(fit.hasNext){
        expect(fit.scroll,where).toBeLessThanOrEqual(1);
        expect(fit.next,where).toBe(true);
      }
      await page.screenshot({path:`${ART}/${name}_${size.width}x${size.height}.png`});
    }
    await page.setViewportSize({width:768,height:1024});
  }

  await closeQualified(page,1);
  await expect(page.locator('#trainer-go')).toBeVisible();
  const intro=await page.locator('#trainer-card').evaluate(el=>{
    const s=getComputedStyle(el);
    const pill=document.querySelector('.trainer-pill');
    const ps=getComputedStyle(pill);
    return {
      bg:s.backgroundImage,
      border:s.borderTopWidth+' '+s.borderTopColor,
      pillBg:ps.backgroundColor,
      pillFg:ps.color,
    };
  });
  expect(intro.bg).toContain('linear-gradient');
  expect(intro.border.startsWith('3px')).toBe(true);
  expect(intro.pillBg).toBe('rgb(194, 65, 12)');
  expect(intro.pillFg).toBe('rgb(255, 255, 255)');
  const go=await page.locator('#trainer-go').boundingBox();
  expect(go.height).toBeGreaterThanOrEqual(76);
  await shot('battle_intro');

  await page.click('#trainer-go');
  await answer(page,true);
  await expect(page.locator('#trainer-hit')).toBeVisible();
  await state(page,()=>{st.armAt=0;render();});
  const foe=await page.locator('.trainer-foe img').boundingBox();
  expect(foe.height).toBeGreaterThanOrEqual(140);
  expect(foe.height).toBeLessThanOrEqual(160);
  await shot('battle_hit');

  await page.setViewportSize({width:390,height:844});
  const phone=await page.locator('.trainer-foe img').boundingBox();
  expect(phone.height).toBeGreaterThanOrEqual(90);
  expect(phone.height).toBeLessThanOrEqual(100);
  await page.setViewportSize({width:390,height:400});
  await expect(page.locator('.trainer-partner')).toBeHidden();
  await page.setViewportSize({width:768,height:1024});

  await answer(page,false);
  await expect(page.locator('#trainer-worked')).toBeVisible();
  const next=await page.locator('#trainer-next').boundingBox();
  expect(next.height).toBeGreaterThanOrEqual(76);
  await shot('battle_miss');

  await page.click('#trainer-next');
  await answer(page,true);
  await expect(page.locator('#trainer-result')).toContainText('You beat Youngster Joey!');
  const map=await page.locator('#trainer-map').boundingBox();
  expect(map.height).toBeGreaterThanOrEqual(76);
  await shot('battle_won');

  await state(page,()=>{st.armAt=0;});
  await page.click('#trainer-map');
  await expect(page.locator('#round-done')).toBeVisible();
  await shot('battle_round_done');

  await state(page,()=>{st.armAt=0;st.trainerNext=0;});
  await page.click('#round-again');
  await openBattle(page,4);
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await expect(page.locator('#trainer-result')).toContainText('Nice try!');
  await expect(page.locator('#trainer-result')).not.toContainText('0 hits');
  await shot('battle_got_away');
  expect(errors).toEqual([]);
});
