// From grade 2 up (math tier 3), a question whose answers are all whole numbers
// is answered on the on-screen pad. Taps and typed checks share commitAttempt,
// so streaks, hints, help, Rematches, catches, difficulty and saves stay the same.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,nextQuestion,serve,pinXp}=require('./helpers');

let errors;
test.beforeEach(async({page})=>{
  errors=await openGame(page);
  await startGame(page);
});
test.afterEach(()=>expect(errors,'uncaught page errors').toEqual([]));

function serveStem(page,needle){
  return page.evaluate(n=>{
    for(const sub of Object.keys(QB))
      for(const lv of Object.keys(QB[sub])){
        const idx=QB[sub][lv].findIndex(q=>q[0].includes(n));
        if(idx<0)continue;
        const deck=QUEUES[sub][lv];
        const at=deck.indexOf(idx);
        if(at>=0)deck.splice(at,1);
        st.q=serveQuestion(sub,+lv,idx,questionPname());
        st.sel=null;st.cor=false;st.anim='';st.helped=false;
        st.tries=0;st.wrong=[];st.lastXp=0;st.draft='';st.armAt=0;st.wildEscape=false;
        render();
        return {sub,lv:+lv,idx,answer:st.q.answers[st.q.correctIndex],hint:st.q.hint,text:st.q.question};
      }
    return null;
  },needle).then(found=>{
    expect(found,`no question stem contains ${JSON.stringify(needle)}`).not.toBeNull();
    return found;
  });
}

// Types on the pad the way a finger would, then optionally presses Check.
async function pressPad(page,digits,{check=true}={}){
  await state(page,()=>{st.armAt=0;});
  for(const d of String(digits))await page.locator(`[data-digit="${d}"]`).click();
  if(check)await page.locator('[data-pad="check"]').click();
}

test('grade 2 and up type whole-number math; everything else stays multiple choice',async({page})=>{
  const report=await state(page,()=>{
    const problems=[];
    let typed=0,lv3=0,lv4=0;
    const expectTyped=(sub,lv,stem,yes)=>{
      const raw=QB[sub][lv].find(q=>q[0].includes(stem));
      if(!raw){problems.push(`missing ${stem}`);return;}
      const idx=QB[sub][lv].indexOf(raw);
      const q=fillQuestion({sub,lv:+lv,idx,raw,order:raw[1].map((_,i)=>i),cheer:raw[3]},'P');
      if(isTypedQuestion(q)!==yes)problems.push(`${stem} typed=${isTypedQuestion(q)} expected ${yes}`);
    };
    for(const sub of Object.keys(QB))
      for(const lv of Object.keys(QB[sub]))
        QB[sub][lv].forEach((raw,idx)=>{
          const q=fillQuestion({sub,lv:+lv,idx,raw,order:raw[1].map((_,i)=>i),cheer:raw[3]},'P');
          const numeric=raw[1].every(a=>/^\d+$/.test(a));
          const which=/^Which number is\b/i.test(raw[0]);
          const should=sub==='math'&&+lv>=TYPED_MIN_LEVEL&&numeric&&!which;
          if(isTypedQuestion(q)!==should)problems.push(`predicate ${sub}/${lv}: ${raw[0]}`);
          if(!should)return;
          typed++;
          if(+lv===3)lv3++;
          if(+lv===4)lv4++;
          const ans=raw[1][raw[2]];
          if(String(ans).length>TYPED_MAX_DIGITS)problems.push(`answer ${ans} longer than the pad: ${raw[0]}`);
          const bare=/^What is \d+ [+\-x] \d+\?$/.test(raw[0]);
          if(bare&&!isTypedQuestion(q))problems.push(`bare arithmetic stayed multiple choice: ${raw[0]}`);
        });
    expectTyped('math',1,'What is 2 + 2?',false);
    expectTyped('math',3,'What is 25 + 10?',true);
    expectTyped('math',3,'Which number is ODD?',false);
    expectTyped('math',4,'The clock says 3:30',false);
    expectTyped('math',4,'naps from 2:00',false);
    expectTyped('math',4,'How many minutes are in HALF an hour?',true);
    expectTyped('math',4,'What is 2 x 5?',true);
    expectTyped('reading',1,'What letter does CAT',false);
    return {problems,typed,lv3,lv4,min:TYPED_MIN_LEVEL};
  });
  expect(report.problems).toEqual([]);
  expect(report.min).toBe(3);
  expect(report.typed).toBeGreaterThan(20);
  expect(report.lv3).toBeGreaterThan(0);
  expect(report.lv4).toBeGreaterThan(0);
});

test('a higher-tier sum shows the pad and no choices or keyboard field',async({page})=>{
  const q=await serveStem(page,'What is 25 + 10?');
  expect(q.lv).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-typed="1"]')).toBeVisible();
  await expect(page.locator('.ans-btn')).toHaveCount(0);
  await expect(page.locator('input, textarea')).toHaveCount(0);
  await expect(page.locator('.pad-key')).toHaveCount(12);
  await expect(page.locator('#pad-read')).toHaveClass(/empty/);
  await expect(page.locator('#pad-read')).not.toHaveText(q.answer);
  const mark=await page.evaluate(()=>{const el=document.querySelector('.qtext');el.dataset.mark='stay';return true;});
  expect(mark).toBe(true);
  await page.locator('[data-digit="3"]').click();
  await page.locator('[data-digit="5"]').click();
  await expect(page.locator('#pad-read')).toHaveText('35');
  expect(await page.evaluate(()=>document.querySelector('.qtext').dataset.mark)).toBe('stay');
  await page.locator('[data-pad="erase"]').click();
  await expect(page.locator('#pad-read')).toHaveText('3');
});

test('kindergarten math and clocks and odd-or-even stay four choices',async({page})=>{
  await serveStem(page,'What is 2 + 2?');
  await expect(page.locator('.ans-btn')).toHaveCount(4);
  await expect(page.locator('[data-typed="1"]')).toHaveCount(0);
  await serveStem(page,'Which number is ODD?');
  await expect(page.locator('.ans-btn')).toHaveCount(4);
  await expect(page.locator('[data-typed="1"]')).toHaveCount(0);
  await serveStem(page,'The clock says 3:30');
  await expect(page.locator('.ans-btn')).toHaveCount(4);
  await serveStem(page,'naps from 2:00');
  await expect(page.locator('.ans-btn')).toHaveCount(4);
  await expect(page.locator('.ans-btn',{hasText:'2 hours'})).toBeVisible();
});

test('a first-try Check grows the streak and pays the streak ladder',async({page})=>{
  await pinXp(page);
  const q=await serveStem(page,'What is 25 + 10?');
  await pressPad(page,q.answer);
  expect(await state(page,()=>st.streak)).toBe(1);
  expect(await state(page,()=>st.tries)).toBe(1);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>xpForStreak(1)));
  await expect(page.locator('#pad-read')).toHaveClass(/ok/);
  await expect(page.locator('#pad-read')).toHaveText(q.answer);
  await expect(page.locator('.pad-key')).toHaveCount(0);
  await expect(page.locator('.result-msg')).toHaveCount(0);
});

test('a typed miss keeps the question and its hint, then a correct Check pays the after-hint rate',async({page})=>{
  await pinXp(page);
  await state(page,()=>{st.streak=4;});
  const q=await serveStem(page,'ran 14 laps');
  await pressPad(page,'1');
  expect(await state(page,()=>st.streak)).toBe(0);
  expect(await state(page,()=>st.tries)).toBe(1);
  expect(await state(page,()=>st.cor)).toBe(false);
  expect(await state(page,()=>st.q.question)).toBe(q.text);
  await expect(page.locator('.result-msg')).toContainText(q.hint);
  await expect(page.locator('.hint-visual')).toBeVisible();
  await expect(page.locator('#pad-read')).toHaveClass(/empty/);
  await expect(page.locator('.pad-key')).toHaveCount(12);
  await pressPad(page,q.answer);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>XP_AFTER_HINT));
  expect(await state(page,()=>st.streak)).toBe(0);
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  await expect(page.locator('#pad-read.ok')).toHaveText(q.answer);
});

test('leading zeros and whitespace count as the same number, and a blank Check is not a try',async({page})=>{
  await pinXp(page);
  const q=await serveStem(page,'What is 25 + 10?');
  await state(page,()=>{submitTyped('');submitTyped('   ');submitTyped('3 5');});
  expect(await state(page,()=>st.tries)).toBe(0);
  await page.locator('[data-pad="check"]').click();
  expect(await state(page,()=>st.tries)).toBe(0);
  const padded=' 0'+q.answer+' ';
  await state(page,v=>{submitTyped(v);},padded);
  expect(await state(page,()=>st.cor)).toBe(true);
  expect(await state(page,()=>st.streak)).toBe(1);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>xpForStreak(1)));
  expect(await state(page,()=>[typedValue(' 007 '),typedValue('018'),typedValue('1 8'),typedValue('')])).toEqual(['7','18',null,null]);
});

test('a zero typed before other digits does not stick, and the pad stops at four digits',async({page})=>{
  await serveStem(page,'ran 14 laps');
  await pressPad(page,'017',{check:false});
  await expect(page.locator('#pad-read')).toHaveText('17');
  await page.locator('[data-pad="erase"]').click();
  await page.locator('[data-pad="erase"]').click();
  await expect(page.locator('#pad-read')).toHaveClass(/empty/);
  await pressPad(page,'99999',{check:false});
  await expect(page.locator('#pad-read')).toHaveText('9999');
});

test('digits and Check do nothing while the question is still arming',async({page})=>{
  await serveStem(page,'What is 25 + 10?');
  await state(page,()=>{st.armAt=Date.now()+60000;render();});
  await page.locator('[data-digit="3"]').click();
  await page.locator('[data-digit="5"]').click();
  await expect(page.locator('#pad-read')).toHaveClass(/empty/);
  await state(page,()=>{st.draft='35';render();});
  await page.locator('[data-pad="check"]').click();
  expect(await state(page,()=>({tries:st.tries,cor:st.cor,draft:st.draft}))).toEqual({tries:0,cor:false,draft:'35'});
  await state(page,()=>{typeDigit('1');eraseDigit();submitTyped('35');});
  expect(await state(page,()=>st.tries)).toBe(0);
});

test('asking for help, then a correct Check, pauses the streak and pays the help rate',async({page})=>{
  await pinXp(page);
  const q=await serveStem(page,'What is 25 + 10?');
  await state(page,()=>{st.streak=6;});
  await page.click('#help-btn');
  await expect(page.locator('.help-box')).toContainText(q.hint);
  await expect(page.locator('[data-typed="1"]')).toBeVisible();
  await pressPad(page,q.answer);
  expect(await state(page,()=>st.streak)).toBe(6);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>XP_WITH_HELP));
  await state(page,()=>{const r=Math.random;Math.random=()=>0;try{onNext();}finally{Math.random=r;}});
  expect(await state(page,()=>st.phase)).toBe('play');
});

test('a typed miss comes back as a Rematch after the gap',async({page})=>{
  await pinXp(page);
  const q=await serveStem(page,'What is 25 + 10?');
  const key=`${q.sub}/${q.lv}/${q.idx}`;
  await pressPad(page,'1');
  expect(await state(page,()=>st.review.map(reviewKey))).toEqual([key]);
  await pressPad(page,q.answer);
  const gap=await state(page,()=>REVIEW.gap);
  for(let i=1;i<gap;i++){
    await answer(page,true);await nextQuestion(page);
    expect(await state(page,()=>!!st.q.rematch),`too early at ${i}`).toBe(false);
  }
  await answer(page,true);await nextQuestion(page);
  expect(await state(page,()=>[!!st.q.rematch,reviewKey(st.q.tmpl)])).toEqual([true,key]);
  await expect(page.locator('.rematch-pill')).toBeVisible();
  await expect(page.locator('[data-typed="1"]')).toBeVisible();
});

test('a typed catch fills a pip, a miss spends a ball, and help fills nothing',async({page})=>{
  await state(page,()=>{st.cor=true;triggerWildEncounter(false);});
  const q=await serveStem(page,'What is 25 + 10?');
  expect(await state(page,()=>st.phase)).toBe('wild');
  await pressPad(page,q.answer);
  expect(await state(page,()=>st.wild.correctStreak)).toBe(1);
  await expect(page.locator('.catch-pip.filled')).toHaveCount(1);
  await expect(page.locator('.miss-ball.used')).toHaveCount(0);

  await state(page,()=>{st.cor=true;triggerWildEncounter(false);});
  const missed=await serveStem(page,'What is 2 x 5?');
  await pressPad(page,'1');
  expect(await state(page,()=>({cs:st.wild.correctStreak,misses:st.wild.misses,gone:st.wildEscape}))).toEqual({cs:0,misses:1,gone:false});
  await expect(page.locator('.miss-ball.used')).toHaveCount(1);
  await expect(page.locator('.result-msg')).toContainText(missed.hint);
  await expect(page.locator('.hint-visual')).toBeVisible();
  // A retry on the same question is not another ball. The next question's first miss is.
  const fled=await serveStem(page,'What is 3 x 3?');
  await pressPad(page,'1');
  expect(await state(page,()=>st.wildEscape)).toBe(true);
  await expect(page.locator('#pad-read.ok')).toHaveText(fled.answer);
  await expect(page.locator('.pad-key')).toHaveCount(0);
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  await expect(page.locator('.result-msg')).toContainText('ran away');

  await state(page,()=>{st.cor=true;triggerWildEncounter(false);});
  const helped=await serveStem(page,'What is 4 x 4?');
  await page.click('#help-btn');
  await pressPad(page,helped.answer);
  expect(await state(page,()=>({cs:st.wild.correctStreak,misses:st.wild.misses}))).toEqual({cs:0,misses:0});
});

test('typed first-tries step the math difficulty up',async({page})=>{
  await state(page,()=>{st.stats.math.level=3;st.stats.math.cs=0;});
  const need=await state(page,()=>LEVEL_UP_STREAK);
  for(let i=0;i<need;i++){
    await serve(page,{sub:'math',lv:3,idx:i});
    expect(await state(page,()=>isTypedQuestion(st.q))).toBe(true);
    await state(page,()=>{st.armAt=0;submitTyped(st.q.answers[st.q.correctIndex]);});
  }
  expect(await state(page,()=>st.stats.math.level)).toBe(4);
});

test('a typed correct is saved like any other answer, and the pad draft is not',async({page})=>{
  const q=await serveStem(page,'What is 25 + 10?');
  await state(page,()=>{st.draft='3';save();});
  const mid=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')));
  expect(mid.draft).toBeUndefined();
  await state(page,()=>{st.draft='';});
  await pressPad(page,q.answer);
  const cor=await state(page,()=>st.stats.math.cor);
  expect(cor).toBe(1);
  await page.reload();
  expect(await state(page,()=>({cor:st.stats.math.cor,level:st.stats.math.level,draft:st.draft,phase:st.phase}))).toEqual({cor:1,level:1,draft:'',phase:'play'});
});

test('the same question still scores when a test answers it by tapping an option index',async({page})=>{
  await pinXp(page);
  await serveStem(page,'What is 25 + 10?');
  await answer(page,true);
  expect(await state(page,()=>st.streak)).toBe(1);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>xpForStreak(1)));
});

test('the pad fits a phone-width screen',async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await serveStem(page,'What is 25 + 10?');
  const pad=page.locator('.numpad');
  const box=await pad.boundingBox();
  const card=await page.locator('.card').last().boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(card.width+1);
  const key=await page.locator('.pad-key').first().boundingBox();
  expect(key.height).toBeGreaterThanOrEqual(48);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
