// Mastery before a Gym. Eligible tries live on the log tape math|@|tier.
// A right after a hint is a "0". Review, Rematch, and Gym do not write it.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,nextQuestion,serve}=require('./helpers');

const DAY1=new Date(2026,10,17,9,0,0);
const DAY2=new Date(2026,10,18,9,0,0);

function kid(data){
  return {
    v:1,roster:1,activeId:'simon',
    kids:[{
      id:'simon',name:'Simon',avatar:'#025',
      data:Object.assign({
        v:1,starter:0,activeIdx:0,
        team:[{num:'#025',level:12,xp:0}],
        dex:['#025'],
        subject:'math',
        stats:{
          math:{cor:10,att:40,level:3,cs:0,ws:0},
          reading:{cor:0,att:0,level:1,cs:0,ws:0},
          science:{cor:0,att:0,level:1,cs:0,ws:0},
        },
        badges:{math:[1,2],reading:[],science:[]},
        settings:{grade:3},
      },data),
    }],
  };
}

async function boot(page,save){
  await page.clock.install({time:save?DAY2:DAY1});
  const errors=await openGame(page,save?{save}:undefined);
  if(!save)await startGame(page,'math');
  await state(page,()=>{
    const tm=activeTM();
    tm.level=60;tm.xp=-8000;st.pendingEvo=null;
    const line=LINES.find(ln=>ln.includes(tm.pi))||LINES[0];
    tm.pi=line[line.length-1];
  });
  return errors;
}

function drill(page,{n,lv,correct=true,start=0}){
  return state(page,({n,lv,correct,start})=>{
    const bank=QB.math[lv].length;
    for(let i=0;i<n;i++){
      st.phase='play';
      st.q=serveQuestion('math',lv,(start+i)%bank,questionPname());
      st.tries=0;st.helped=false;st.cor=false;st.wrong=[];st.armAt=0;st.draft='';
      const pick=correct?st.q.correctIndex:st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex);
      commitAttempt(!!correct,pick);
    }
  },{n,lv,correct,start});
}

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  for(const d of String(Number(m[1])*Number(m[2])))await page.locator(`[data-parent-digit="${d}"]`).click();
  await page.click('#parent-go');
  await expect(page.locator('#parent-report')).toBeVisible();
}

async function openParents(page){
  if(!(await page.locator('#parents-link').isVisible())){
    if(await page.locator('#nav-pdx').isVisible())await page.click('#nav-pdx');
  }
  await page.click('#parents-link');
  await passParentGate(page);
}

test('29 eligible tries do not open a Gym, and the 30th on a second day does',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.level=1;st.stats.math.cs=0;st.badges.math=[];st.gymOffer.math=null;});
  await drill(page,{n:25,lv:1});
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:4,lv:1,start:25});
  expect(await state(page,()=>st.gymOffer.math)).toBeNull();
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  await drill(page,{n:1,lv:1,start:29});
  const snap=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(snap.total).toBe(30);
  expect(snap.qualified).toBeGreaterThanOrEqual(2);
  expect(snap.open).toBe(true);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});
  await expect(page.locator('.gym-invite')).toContainText('Pikachu wants a Gym battle!');
  await expect(page.locator('[data-gym-start="math"]')).toBeVisible();
  await expect(page.locator('[data-gym-later="math"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('50 tries on one day do not open a Gym, and 5 more the next day do',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;});
  await drill(page,{n:50,lv:1});
  expect(await state(page,()=>st.gymOffer.math)).toBeNull();
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:4,lv:1,start:50});
  expect(await state(page,()=>st.gymOffer.math)).toBeNull();
  await drill(page,{n:1,lv:1,start:54});
  const snap=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(snap.total).toBe(40);
  expect(snap.qualified).toBeGreaterThanOrEqual(2);
  expect(snap.open).toBe(true);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});
  await expect(page.locator('.gym-invite')).toBeVisible();
  expect(errors).toEqual([]);
});

test('84 percent of the last 40 does not open a Gym, and 85 percent does',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;});
  // 7 misses then 13 rights, then 20 rights the next day: 33/40.
  await drill(page,{n:7,lv:1,correct:false});
  await drill(page,{n:13,lv:1,start:7});
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:20,lv:1,start:20});
  expect(await state(page,()=>st.gymOffer.math)).toBeNull();
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  const early=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(early.right).toBe(33);
  expect(early.att).toBe(40);
  expect(early.ratio).toBeLessThan(0.85);
  expect(early.open).toBe(false);
  // The next right pushes a miss out of the window: 34/40.
  await drill(page,{n:1,lv:1,start:40});
  const snap=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(snap.right*100).toBeGreaterThanOrEqual(snap.att*85);
  expect(snap.open).toBe(true);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});
  await expect(page.locator('.gym-invite')).toBeVisible();
  expect(errors).toEqual([]);
});

test('review, Rematch, and Gym answers do not change the mastery tally',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=2;st.badges.math=[1];st.gymOffer.math=null;st.review=[];
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
  });
  await drill(page,{n:3,lv:2});
  const before=await state(page,()=>masterySnapshot(st.log,'math',2));

  await state(page,()=>{
    st.reviewCount.math=4;
    st.review=[];
    st.seen=[];
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.bankReview)).toBe(true);
  await answer(page,true);
  expect(await state(page,()=>masterySnapshot(st.log,'math',2))).toEqual(before);
  await state(page,()=>{
    st.phase='play';st.gym=null;
    st.q=serveQuestion('math',2,1,questionPname());
    st.q.bankReview=true;
    st.cor=false;st.tries=0;st.wrong=[];st.helped=false;st.armAt=0;
  });
  expect(await state(page,()=>st.q.tmpl.lv)).toBe(2);
  const kinder=await state(page,()=>{
    const day=localISO(new Date());
    return st.log[day]&&st.log[day]['math|@|1'];
  });
  await answer(page,true);
  expect(await state(page,()=>masterySnapshot(st.log,'math',2))).toEqual(before);
  expect(await state(page,()=>{
    const day=localISO(new Date());
    return st.log[day]&&st.log[day]['math|@|1'];
  }),'a tier-2 review must not write the kindergarten tape').toBe(kinder);

  await state(page,()=>{
    st.phase='play';st.gym=null;
    st.review=[{sub:'math',lv:2,idx:0,wins:0,due:0,why:'miss'}];
    st.served=10;st.lastRematchAt=null;
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.rematch)).toBe(true);
  await answer(page,true);
  expect(await state(page,()=>masterySnapshot(st.log,'math',2))).toEqual(before);

  await state(page,()=>{
    st.phase='play';st.gymOffer.math={tier:2,cool:0};st.cor=true;st.badges.math=[1];
    render();
  });
  await page.click('[data-gym-start="math"]');
  await answer(page,true);
  expect(await state(page,()=>masterySnapshot(st.log,'math',2))).toEqual(before);
  expect(errors).toEqual([]);
});

test('a hint is an attempt only, and a wild encounter counts',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;});
  await serve(page,{sub:'math',lv:1,idx:0});
  await state(page,()=>askForHelp());
  await answer(page,true);
  const helped=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(helped.total).toBe(1);
  expect(helped.right).toBe(0);
  expect(helped.window.endsWith('0')).toBe(true);

  await state(page,()=>{st.cor=true;triggerWildEncounter(false);});
  await answer(page,true);
  const wild=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(wild.total).toBe(2);
  expect(wild.right).toBe(1);
  expect(wild.window.endsWith('1')).toBe(true);
  expect(errors).toEqual([]);
});

test('below a grade lock, the tier changes only after mastery and a Gym win',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.grade=3;st.stats.math.level=2;st.stats.math.cs=0;st.badges.math=[1];st.gymOffer.math=null;
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
  });
  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:2,idx:i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math}))).toEqual({level:2,offer:null});

  await drill(page,{n:20,lv:2,start:5});
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:4,lv:2,start:25});
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await state(page,()=>st.gymOffer.math)).toBeNull();
  await drill(page,{n:1,lv:2,start:29});
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:2,cool:0});
  await expect(page.locator('.gym-invite')).toBeVisible();

  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math].sort(),phase:st.phase}))).toEqual({
    level:3,badges:[1,2],phase:'award',
  });
  await state(page,()=>{st.armAt=0;});
  await page.click('#award-go');
  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:3,idx:i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math}))).toEqual({level:3,offer:null});
  expect(errors).toEqual([]);
});

test('climbing back onto a badge needs mastery and no second Gym',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.grade=0;st.stats.math.level=1;st.stats.math.cs=0;st.badges.math=[1];st.gymOffer.math=null;
  });
  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:1,idx:i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math}))).toEqual({level:1,offer:null});
  await drill(page,{n:20,lv:1,start:5});
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:5,lv:1,start:25});
  const snap=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(snap.open).toBe(true);
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math,badges:[...st.badges.math]}))).toEqual({
    level:2,offer:null,badges:[1],
  });
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an old save keeps a pending gymOffer and does not bump SAVE_V',async({page})=>{
  const save=kid({
    stats:{
      math:{cor:4,att:4,level:1,cs:0,ws:0},
      reading:{cor:0,att:0,level:1,cs:0,ws:0},
      science:{cor:0,att:0,level:1,cs:0,ws:0},
    },
    badges:{math:[],reading:[],science:[]},
    settings:{grade:'auto'},
    gymOffer:{math:{tier:1,cool:2},reading:null,science:null},
  });
  const errors=await boot(page,save);
  expect(await state(page,()=>SAVE_V)).toBe(1);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:2});
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  await state(page,()=>{st.cor=true;render();});
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a Gym already in progress can still be won without mastery',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=1;st.badges.math=[];st.log={};
    st.gymOffer.math={tier:1,cool:0};st.cor=true;render();
  });
  await page.click('[data-gym-start="math"]');
  await page.reload();
  expect(await state(page,()=>st.phase)).toBe('gym');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  expect(await state(page,()=>({level:st.stats.math.level,phase:st.phase,badges:[...st.badges.math]}))).toEqual({
    level:2,phase:'award',badges:[1],
  });
  expect(errors).toEqual([]);
});

test('a Gym loss keeps the cooldown and does not reset mastery',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;});
  await drill(page,{n:25,lv:1});
  expect(await state(page,()=>st.gymOffer.math),'one day is not enough').toBeNull();
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:5,lv:1,start:25});
  const before=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(before.open).toBe(true);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.kid=1;});
  await answer(page,false);
  const lost=await state(page,()=>({over:st.gym&&st.gym.over,cool:st.gymOffer.math&&st.gymOffer.math.cool,level:st.stats.math.level}));
  expect(lost.over).toBe('lose');
  expect(lost.cool).toBe(await state(page,()=>GYM_COOLDOWN));
  expect(lost.level).toBe(1);
  expect(await state(page,()=>masterySnapshot(st.log,'math',1))).toEqual(before);
  await page.click('#gym-back');
  const cool=await state(page,()=>GYM_COOLDOWN);
  await drill(page,{n:cool,lv:1,start:30});
  expect(await state(page,()=>st.gymOffer.math.cool)).toBe(0);
  await expect(page.locator('.gym-invite')).toBeVisible();
  expect(await state(page,()=>masterySnapshot(st.log,'math',1).open)).toBe(true);
  expect(errors).toEqual([]);
});

test('a future date counts as today, so it is not a second day',async({page})=>{
  const errors=await boot(page);
  const snap=await state(page,()=>{
    const today=localISO(new Date());
    st.log={
      [today]:{'math|@|1':'1'.repeat(25)},
      '2099-01-01':{'math|@|1':'1'.repeat(10)},
    };
    return masterySnapshot(st.log,'math',1);
  });
  expect(snap.total).toBe(35);
  expect(snap.qualified).toBe(1);
  expect(snap.open).toBe(false);
  expect(errors).toEqual([]);
});

test('an empty log starts at Kindergarten, and a weak tier 3 moves below the grade lock',async({page})=>{
  const emptyErrors=await boot(page,kid({}));
  expect(await state(page,()=>({level:st.stats.math.level,grade:st.grade,badges:[...st.badges.math]}))).toEqual({
    level:1,grade:3,badges:[1,2],
  });
  expect(emptyErrors).toEqual([]);

  const thin=await page.context().newPage();
  await thin.clock.install({time:DAY2});
  const thinErrors=await openGame(thin,{save:kid({
    log:{'2026-11-18':{'math|@|3':'1'.repeat(12)}},
  })});
  expect(await state(thin,()=>({
    level:st.stats.math.level,
    tape:((st.log['2026-11-18']||{})['math|@|3']||'').length,
    badges:[...st.badges.math].sort(),
  }))).toEqual({level:1,tape:12,badges:[1,2]});
  expect(thinErrors).toEqual([]);
  await thin.close();

  const weak=await page.context().newPage();
  await weak.clock.install({time:DAY2});
  const weakErrors=await openGame(weak,{save:kid({
    log:{
      '2026-11-17':{'math|@|3':'0'.repeat(20)},
      '2026-11-18':{'math|@|3':'0'.repeat(20)},
    },
  })});
  expect(await state(weak,()=>({
    level:st.stats.math.level,grade:st.grade,badges:[...st.badges.math].sort(),
    tape:((st.log['2026-11-18']||{})['math|@|3']||'').length,
  }))).toEqual({level:1,grade:3,badges:[1,2],tape:20});
  expect(weakErrors).toEqual([]);
  await weak.close();
});

test('placement stops at the lowest tier that is not solid',async({page})=>{
  const solid='1'.repeat(20);
  const errors=await boot(page,kid({
    log:{
      '2026-11-17':{'math|@|1':solid,'math|@|3':'0'.repeat(20)},
      '2026-11-18':{'math|@|1':solid,'math|@|3':'0'.repeat(20)},
    },
  }));
  // Tier 1 meets mastery. Tier 2 has no tape. Tier 3 is 0 for 40. Land on 2.
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await state(page,()=>[...st.badges.math].sort())).toEqual([1,2]);
  expect(errors).toEqual([]);
});

test('a solid current tier is not pulled down for lack of older tapes',async({page})=>{
  const solid='1'.repeat(20);
  const errors=await boot(page,kid({
    log:{
      '2026-11-17':{'math|@|3':solid},
      '2026-11-18':{'math|@|3':solid},
    },
  }));
  expect(await state(page,()=>masterySnapshot(st.log,'math',3).open)).toBe(true);
  expect(await state(page,()=>st.stats.math.level)).toBe(3);
  expect(errors).toEqual([]);
});

test('the Parents Gym line uses the same numbers as the gate',async({page})=>{
  const zeros='0'.repeat(20);
  const ones='1'.repeat(30);
  const log={
    '2026-11-17':{'math|@|3':zeros,'math|Adding|3':[0,20,0]},
    '2026-11-18':{'math|@|3':ones,'math|Adding|3':[30,30,0]},
  };
  const errors=await boot(page,kid({log}));
  expect(await state(page,()=>MASTERY_GYM)).toBe(true);
  const shown=await state(page,()=>{
    const tier=st.stats.math.level;
    const snap=masterySnapshot(activeKid().data.log,'math',tier);
    return {text:gymLineText('math',tier,activeKid().data.log),pct:snap.pct,att:snap.att,days:snap.days,open:snap.open};
  });
  const tries=shown.att===1?'try':'tries';
  const days=shown.days===1?'1 day':shown.days+' days';
  // No tries yet is "just started" instead of "0% over 0 tries". Any real
  // tally is still the gate's own numbers.
  if(shown.att===0)expect(shown.text).toContain('just started');
  else expect(shown.text).toContain(`${shown.pct}% right over ${shown.att} ${tries} on ${days}`);
  expect(shown.open).toBe(false);
  await openParents(page);
  if(shown.att===0)await expect(page.locator('.prog-gym')).toContainText('just started');
  else await expect(page.locator('.prog-gym')).toContainText(`${shown.pct}% right over ${shown.att} ${tries} on ${days}`);
  const sample=await state(page,saved=>masterySnapshot(saved,'math',3),log);
  expect(sample).toMatchObject({pct:75,att:40,days:2,total:40,open:false});
  expect(sample.right*100).toBeLessThan(sample.att*85);
  expect(errors).toEqual([]);
});

function screenAudit(){
  const main=document.getElementById('app-main');
  const nav=document.getElementById('bottom-nav').getBoundingClientRect();
  const buttons=[...document.querySelectorAll('#game button, #bottom-nav button, #mute-btn')];
  const short=[];
  for(const el of buttons){
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden')continue;
    const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2)continue;
    if(r.height<43.5||r.width<43.5)short.push((el.id||el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height));
  }
  const small=[];
  const walker=document.createTreeWalker(document.getElementById('game'),NodeFilter.SHOW_TEXT);
  const seen=new Set();
  let node;
  while((node=walker.nextNode())){
    if(!node.textContent||!node.textContent.trim())continue;
    const el=node.parentElement;
    if(!el||seen.has(el))continue;
    seen.add(el);
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden')continue;
    const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2)continue;
    const size=parseFloat(s.fontSize);
    if(size<14)small.push(node.textContent.trim().slice(0,24)+' '+size);
  }
  const img=document.querySelector('#game .mon-strip img');
  const ring=document.querySelector('.gym-ring');
  return {
    scroll:main.scrollHeight-main.clientHeight,
    short,small,
    hero:img?img.getBoundingClientRect().height:0,
    fill:ring?ring.getAttribute('data-fill'):'',
    label:ring?ring.getAttribute('aria-label'):'',
  };
}

test('results inside the last 40 survive a 14-day prune and still open the gate',async({page})=>{
  const errors=await boot(page);
  const snap=await state(page,()=>{
    st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;
    const log={};
    const start=new Date(2026,10,2);
    for(let i=0;i<16;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      log[localISO(d)]={'math|@|1':'1'.repeat(i<2?5:2)};
    }
    st.log=log;
    save();
    return masterySnapshot(st.log,'math',1);
  });
  expect(snap.total).toBe(38);
  expect(snap.qualified).toBeGreaterThanOrEqual(2);
  expect(snap.right).toBe(38);
  expect(snap.open).toBe(true);
  await page.reload();
  const again=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(again.total).toBe(38);
  expect(again.qualified).toBeGreaterThanOrEqual(2);
  expect(again.open).toBe(true);
  expect(errors).toEqual([]);
});

test('81 results on one day stay in the last 40',async({page})=>{
  const errors=await boot(page);
  const snap=await state(page,()=>{
    st.stats.math.level=1;
    st.log={'2026-11-17':{'math|@|1':'1'.repeat(81),'math|@|1|n':81}};
    return masterySnapshot(st.log,'math',1);
  });
  expect(snap.total).toBe(40);
  expect(snap.total).not.toBe(0);
  expect(errors).toEqual([]);
});

test('81 misses are not thrown away before the next day opens the Gym',async({page})=>{
  const errors=await boot(page);
  const snap=await state(page,()=>{
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math=null;
    st.log={
      '2026-11-16':{'math|@|1':'0'.repeat(81),'math|@|1|n':81},
      '2026-11-17':{'math|@|1':'1'.repeat(30),'math|@|1|n':30},
    };
    return masterySnapshot(st.log,'math',1);
  });
  expect(snap.open).toBe(false);
  expect(snap.right).toBeLessThan(snap.att);
  expect(errors).toEqual([]);
});

test('a day with 5 tries still qualifies when only some of them remain in the last 40',async({page})=>{
  const errors=await boot(page);
  const snap=await state(page,()=>{
    st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;
    const log={};
    const start=new Date(2026,10,4);
    for(let i=0;i<14;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      log[localISO(d)]={'math|@|1':'1'.repeat(i===0?10:3)};
    }
    st.log=log;
    save();
    return masterySnapshot(st.log,'math',1);
  });
  expect(snap.total).toBe(40);
  expect(snap.att).toBe(40);
  expect(snap.qualified).toBeGreaterThanOrEqual(1);
  await page.reload();
  const again=await state(page,()=>masterySnapshot(st.log,'math',1));
  expect(again.total).toBe(40);
  expect(again.qualified).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('a Rematch miss does not count toward a warm-up',async({page})=>{
  // Was "does not count toward the 3-miss drop". A Rematch still must not
  // finish the run. The next current-tier miss does, and that starts a
  // warm-up instead of dropping the level. Kindergarten is solid, so
  // placement is not what would have moved him.
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=2;
    st.stats.math.ws=2;
    st.badges.math=[1];
    st.gymOffer.math=null;
    st.log={
      '2026-11-16':{'math|@|1':'1'.repeat(20)},
      '2026-11-17':{'math|@|1':'1'.repeat(20)},
    };
    st.review=[{sub:'math',lv:2,idx:0,wins:0,due:0,why:'miss'}];
    st.served=10;st.lastRematchAt=null;
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.rematch)).toBe(true);
  await answer(page,false);
  expect(await state(page,()=>({level:st.stats.math.level,ws:st.stats.math.ws,badges:[...st.badges.math],warm:st.warmup||null}))).toEqual({
    level:2,ws:2,badges:[1],warm:null,
  });
  await serve(page,{sub:'math',lv:2,idx:4});
  await answer(page,false);
  expect(await state(page,()=>({level:st.stats.math.level,warm:!!st.warmup}))).toEqual({level:2,warm:true});
  expect(errors).toEqual([]);
});

test('a pending evolution or level-up holds the Gym invite until the event is gone',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.cor=true;
    st.tries=1;
    const tm=activeTM();
    tm.pi=0;
    st.pendingEvo={fromPi:0,toPi:1};
    render();
  });
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  await expect(page.locator('#nxt')).toContainText("What's happening");
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});

  await state(page,()=>{
    st.pendingEvo=null;
    st.lvlUpMsg='Bulbasaur grew to level 61!';
    render();
  });
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  await expect(page.locator('#nxt')).not.toContainText("What's happening");
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});

  await state(page,()=>{st.lvlUpMsg=null;render();});
  await expect(page.locator('.gym-invite')).toBeVisible();
  await expect(page.locator('[data-gym-start="math"]')).toHaveCount(1);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});
  expect(errors).toEqual([]);
});

test('a held Gym invite returns on the next question and the offer survives a reload',async({page})=>{
  test.setTimeout(45000);
  const errors=await boot(page);
  await page.setViewportSize({width:768,height:1024});
  await state(page,()=>{
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.log={
      '2026-11-16':{'math|@|1':'1'.repeat(20)},
      '2026-11-17':{'math|@|1':'1'.repeat(20)},
    };
    st.cor=true;
    st.tries=1;
    const tm=activeTM();
    tm.pi=0;
    st.pendingEvo={fromPi:0,toPi:1};
    render();
    save();
  });
  const before=await state(page,()=>JSON.parse(JSON.stringify(st.gymOffer)));
  await page.reload();
  expect(await state(page,()=>st.gymOffer)).toEqual(before);
  expect(await state(page,()=>Object.keys(st.gymOffer).filter(k=>st.gymOffer[k]).length)).toBe(1);

  await state(page,()=>{
    st.cor=true;
    st.tries=1;
    const tm=activeTM();
    tm.pi=0;
    st.pendingEvo={fromPi:0,toPi:1};
    render();
  });
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  await expect(page.locator('#nxt')).toContainText("What's happening");
  await state(page,()=>{Math.random=()=>0.99;});
  await page.click('#nxt');
  await page.locator('#evo-overlay.active').waitFor({state:'visible',timeout:5000});
  await page.locator('#evo-overlay.active').waitFor({state:'hidden',timeout:25000});
  await expect(page.locator('.gym-invite')).toBeVisible();
  await expect(page.getByRole('button',{name:/What's happening/})).toHaveCount(0);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});
  expect(errors).toEqual([]);
});

test('the Gym invite is on screen at iPad size when mastery is met',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.level=1;st.badges.math=[];st.gymOffer.math=null;});
  await drill(page,{n:25,lv:1});
  await page.clock.setSystemTime(DAY2);
  await drill(page,{n:5,lv:1,start:25});
  await page.setViewportSize({width:768,height:1024});
  await expect(page.locator('.gym-invite')).toBeVisible();
  const audit=await state(page,screenAudit);
  expect(audit.scroll).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
