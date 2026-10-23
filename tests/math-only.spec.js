// Math is the only subject on offer. Reading and science stay in the bank;
// putting them back in ENABLED_SUBJECTS is the whole restore.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,enableAllSubjects,state,answer,nextQuestion}=require('./helpers');

const SIZES=[
  {width:320,height:568},
  {width:390,height:844},
  {width:568,height:320},
  {width:932,height:430},
  {width:768,height:1024},
];

function playControls(){
  const bar=document.querySelector('#bottom-nav');
  return [...document.querySelectorAll('button, a, input, select, textarea, [role="button"]')].filter(el=>{
    if(bar&&bar.contains(el))return false;
    if(el.closest('.ans-grid, .numpad'))return false;
    if(el.hidden)return false;
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden'||s.pointerEvents==='none')return false;
    const r=el.getBoundingClientRect();
    return r.width>=2&&r.height>=2;
  }).map(el=>el.id||el.className);
}

test('the play screen has no subject control at the five sizes',async({page})=>{
  await openGame(page);
  await startGame(page);
  for(const size of SIZES){
    await page.setViewportSize(size);
    await expect(page.locator('#subj-btn, .subj-opt, .subj-tag, .subj-ask')).toHaveCount(0);
    await expect(page.locator('#game .hdr')).not.toContainText(/Math|Reading|Science|Mix/);
    const controls=await state(page,playControls);
    expect(controls.length,`${size.width}x${size.height}`).toBeLessThanOrEqual(3);
    expect(controls).toEqual(expect.arrayContaining(['mute-btn','who-btn','help-btn']));
  }
  await state(page,()=>{st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});render();});
  const switching=await state(page,playControls);
  expect(switching.length).toBeLessThanOrEqual(4);
  expect(switching).toEqual(expect.arrayContaining(['mute-btn','who-btn','help-btn','mon-switch']));
});

test('two hundred questions in practice, the wild, and a Gym are all math',async({page})=>{
  test.setTimeout(120000);
  await openGame(page);
  await startGame(page);
  const run=await state(page,()=>{
    const subs=[];
    function note(phase){
      if(!st.q||!st.q.subject)throw new Error('no question during '+phase);
      subs.push({phase,sub:st.q.subject});
    }
    st.review.push({sub:'reading',lv:1,idx:0,wins:0,due:0,why:'miss'});
    st.review.push({sub:'science',lv:1,idx:0,wins:0,due:0,why:'miss'});
    for(let i=0;i<100;i++){loadQuestion();note('play');}
    for(let i=0;i<70;i++){
      st.cor=true;
      triggerWildEncounter(false);
      if(st.phase!=='wild'||!st.wild)throw new Error('wild encounter did not start');
      note('wild');
      st.wild=null;
      st.phase='play';
    }
    for(let i=0;i<30;i++){loadQuestion();note('play');}
    st.phase='play';
    st.cor=true;
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.gymOffer.reading={tier:1,cool:0};
    st.stats.reading.level=1;
    st.badges.reading=[];
    startGym('reading');
    if(st.phase==='gym')throw new Error('a reading Gym started');
    startGym('math');
    if(st.phase!=='gym'||!st.gym)throw new Error('math Gym did not start');
    const n=st.gym.queue.length;
    for(let i=0;i<n;i++){
      note('gym');
      if(st.q.subject!=='math')throw new Error('gym dealt '+st.q.subject);
      st.gym.qi++;
      if(st.gym.qi<st.gym.queue.length)dealGymQuestion();
    }
    return {
      n:subs.length,
      subjects:[...new Set(subs.map(s=>s.sub))],
      phases:[...new Set(subs.map(s=>s.phase))],
      wild:subs.filter(s=>s.phase==='wild').length,
      gym:subs.filter(s=>s.phase==='gym').length,
      readingLeft:st.review.filter(r=>r.sub!=='math').length,
    };
  });
  expect(run.n).toBeGreaterThanOrEqual(200);
  expect(run.subjects).toEqual(['math']);
  expect(run.phases.sort()).toEqual(['gym','play','wild']);
  expect(run.wild).toBe(70);
  expect(run.gym).toBeGreaterThan(0);
  expect(run.readingLeft).toBe(2);
});

function progressSave(subject){
  return {
    v:1,roster:1,activeId:'maya',
    kids:[{
      id:'maya',name:'Maya',avatar:'#001',
      data:{
        v:1,starter:0,activeIdx:0,
        team:[{num:'#001',level:12,xp:40}],
        dex:['#001'],
        subject,
        bestStreak:9,
        stats:{
          math:{cor:4,att:5,level:3,cs:2,ws:0},
          reading:{cor:8,att:9,level:2,cs:4,ws:1},
          science:{cor:3,att:3,level:2,cs:1,ws:0},
        },
        badges:{math:[1,2],reading:[1],science:[1]},
        review:[
          {sub:'reading',lv:1,idx:0,q:'Which word rhymes with CAT?',wins:0},
          {sub:'math',lv:1,idx:0,q:'What is 1 + 2?',wins:1},
        ],
      },
    }],
  };
}

test('a reading or science save loads into math with the same progress',async({page})=>{
  for(const subject of ['reading','science']){
    const errors=await openGame(page,{save:progressSave(subject)});
    const got=await state(page,()=>({
      subject:st.subject,
      phase:st.phase,
      q:st.q&&st.q.subject,
      level:st.team[0].level,
      xp:st.team[0].xp,
      num:PKM[st.team[0].pi].num,
      best:st.bestStreak,
      stats:JSON.parse(JSON.stringify(st.stats)),
      badges:JSON.parse(JSON.stringify(st.badges)),
      gym:st.gym,
    }));
    expect(got.subject).toBe(subject);
    expect(got.phase).toBe('play');
    expect(got.q).toBe('math');
    expect(got.level).toBe(12);
    expect(got.xp).toBe(40);
    expect(got.num).toBe('#001');
    expect(got.best).toBe(9);
    expect(got.stats).toEqual(progressSave(subject).kids[0].data.stats);
    expect(got.badges).toEqual(progressSave(subject).kids[0].data.badges);
    expect(got.gym).toBeNull();
    const disk=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.subject);
    expect(disk).toBe(subject);
    expect(errors).toEqual([]);
  }
});

test('a reading Gym still in progress does not deal a reading question',async({page})=>{
  const save=progressSave('reading');
  save.kids[0].data.gym={sub:'reading',tier:2,queue:[0,1,2,3],qi:1,kid:4,lead:5,solved:false,tries:0,helped:false,wrong:[]};
  const errors=await openGame(page,{save});
  const got=await state(page,()=>({phase:st.phase,sub:st.q&&st.q.subject,level:st.stats.reading.level,badge:st.badges.reading.slice(),gym:st.gym}));
  expect(got).toEqual({phase:'play',sub:'math',level:2,badge:[1],gym:null});
  expect(errors).toEqual([]);
});

test('short screens keep a small gap between the answers',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  await page.setViewportSize({width:568,height:320});
  const gap=await page.locator('.ans-grid').evaluate(el=>{
    const g=getComputedStyle(el).gap.split(' ').map(parseFloat);
    return g.length===1?[g[0],g[0]]:g;
  });
  expect(gap[0]).toBeGreaterThanOrEqual(2);
  expect(gap[0]).toBeLessThanOrEqual(4);
  expect(gap[1]).toBeGreaterThanOrEqual(2);
  expect(gap[1]).toBeLessThanOrEqual(4);
  const nav=await page.locator('#bottom-nav').boundingBox();
  const help=await page.locator('#help-btn').boundingBox();
  expect(help.y).toBeGreaterThanOrEqual(0);
  expect(help.y+help.height).toBeLessThanOrEqual(nav.y+0.5);
});

test('putting every subject back in the flag restores the old game',async({page})=>{
  await openGame(page);
  await startGame(page);
  await expect(page.locator('#subj-btn')).toHaveCount(0);
  await enableAllSubjects(page);

  const kept=await state(page,()=>{
    const open=st.q.question;
    render();
    return open;
  });
  await expect(page.locator('#subj-btn')).toBeVisible();
  await expect(page.locator('#subj-btn')).toContainText('Math');
  await page.click('#subj-btn');
  await expect(page.getByText('What do you want to practice?')).toBeVisible();
  expect(await page.locator('.subj-opt').count()).toBe(4);
  for(const sub of ['math','reading','science','mix']){
    await expect(page.locator(`.subj-opt[data-subj="${sub}"]`)).toBeVisible();
  }
  await page.click('[data-subj="reading"]');
  expect(await state(page,()=>st.q.question)).toBe(kept);
  await answer(page,true);
  await nextQuestion(page);
  expect(await state(page,()=>st.q.subject)).toBe('reading');

  const mixed=await state(page,()=>{
    st.subject=SUBJ_MIX;
    st.review=[{sub:'reading',lv:1,idx:0,wins:0,due:0,why:'miss'}];
    const seen=new Set();
    st.review=[];
    for(let i=0;i<12;i++){loadQuestion();seen.add(st.q.subject);}
    st.subject='math';
    st.review=[{sub:'reading',lv:1,idx:0,wins:0,due:0,why:'miss'}];
    const held=[];
    for(let i=0;i<4;i++){loadQuestion();held.push(st.q.subject);}
    st.subject=SUBJ_MIX;
    loadQuestion();
    return {seen:[...seen].sort(),held,rematch:st.q.subject};
  });
  expect(mixed.seen).toEqual(['math','reading','science']);
  expect(mixed.held).toEqual(['math','math','math','math']);
  expect(mixed.rematch).toBe('reading');

  const loaded=await state(page,()=>parseGameSave({
    v:1,starter:0,activeIdx:0,team:[{num:'#004',level:8,xp:15}],dex:['#004'],
    subject:'science',bestStreak:4,
    stats:{math:{cor:1,att:1,level:1,cs:0,ws:0},reading:{cor:2,att:2,level:2,cs:0,ws:0},science:{cor:3,att:4,level:2,cs:1,ws:0}},
    badges:{math:[],reading:[1],science:[1]},
  }));
  expect(loaded.subject).toBe('science');
  expect(loaded.team[0].level).toBe(8);
  expect(loaded.team[0].xp).toBe(15);
  expect(loaded.stats.reading.level).toBe(2);
  expect(loaded.badges.science).toEqual([1]);

  await state(page,()=>{
    const kid=activeKid();
    kid.data.practice={
      recent:[{s:'reading',ok:0},{s:'math',ok:1}],
      topics:{'reading|Rhyming':{n:1,ex:['Which word rhymes with CAT?'],recent:[0]}},
    };
    kid.data.review=[{sub:'reading',lv:1,idx:0,q:QB.reading[1][0][0],wins:0,why:'miss'}];
    parentUnlocked=true;
    viewBeforeParent='game';
    renderParent();
  });
  const card=page.locator('[data-kid-name="Trainer"]');
  await expect(card).toContainText('Rhyming');
  await expect(card).toContainText('Reading:');
});

test('a reading save stays reading after math play and returns when the flag does',async({page})=>{
  const errors=await openGame(page,{save:progressSave('reading')});
  expect(await state(page,()=>st.subject)).toBe('reading');
  expect(await state(page,()=>st.q.subject)).toBe('math');
  const kept=await state(page,()=>({level:st.team[0].level,xp:st.team[0].xp,best:st.bestStreak,badges:JSON.parse(JSON.stringify(st.badges))}));
  await answer(page,true);
  expect(await state(page,()=>st.subject)).toBe('reading');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.subject)).toBe('reading');
  const after=await state(page,()=>({level:st.team[0].level,best:st.bestStreak,badges:JSON.parse(JSON.stringify(st.badges))}));
  expect(after.level).toBe(kept.level);
  expect(after.best).toBe(kept.best);
  expect(after.badges).toEqual(kept.badges);
  expect(kept.xp).toBe(40);
  await enableAllSubjects(page);
  await nextQuestion(page);
  expect(await state(page,()=>st.subject)).toBe('reading');
  expect(await state(page,()=>st.q.subject)).toBe('reading');
  expect(errors).toEqual([]);
});

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  expect(m,'parent check should be a multiplication').not.toBeNull();
  for(const d of String(Number(m[1])*Number(m[2])))await page.locator(`[data-parent-digit="${d}"]`).click();
  await page.click('#parent-go');
}

test('empty badge copy does not say there is no badge',async({page})=>{
  const save=progressSave('reading');
  save.kids[0].data.stats.math={cor:4,att:5,level:1,cs:0,ws:0};
  save.kids[0].data.stats.reading={cor:8,att:9,level:1,cs:0,ws:0};
  save.kids[0].data.stats.science={cor:0,att:0,level:1,cs:0,ws:0};
  save.kids[0].data.badges={math:[],reading:[1],science:[]};
  save.kids[0].data.review=[];
  const errors=await openGame(page,{save});
  await page.click('#nav-pdx');
  await expect(page.locator('.gym-wait')).toHaveText('Win a Gym battle to earn a badge!');
  await expect(page.locator('#pokedex-page')).not.toContainText('Tale Badge');
  await expect(page.locator('#pokedex-page')).not.toContainText('first badge');
  await page.click('#parents-link');
  await passParentGate(page);
  const card=page.locator('[data-kid-name="Maya"]');
  await expect(card).toContainText('4 right out of 5');
  await expect(card).not.toContainText('No badges yet');
  await expect(card).not.toContainText('Badges');
  await expect(card).not.toContainText('Tale Badge');
  await expect(card.locator('.parent-focus')).toHaveCount(0);
  expect(await state(page,()=>st.badges.reading.slice())).toEqual([1]);
  expect(errors).toEqual([]);
});

test('a gym prize says new questions are unlocked',async({page})=>{
  await openGame(page);
  await startGame(page);
  await state(page,()=>{
    st.phase='award';
    st.award={sub:'math',tier:1,again:true};
    render();
  });
  await expect(page.locator('.award-sub')).toHaveText('New questions unlocked!');
});
