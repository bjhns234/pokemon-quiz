// Fixes from the quiz QA pass: a catch or evolution is kept even if the
// animation is interrupted, unfair questions have one clear answer, and the
// phone screens stay usable.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,nextQuestion}=require('./helpers');

const legacy={v:1,starter:0,activeIdx:0,team:[{num:'#001',level:7,xp:3}],dex:['#001'],
  stats:{math:{cor:5,att:6,level:2,cs:1,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
  review:[{sub:'math',lv:1,idx:0,q:'What is 1 + 2?',wins:0}]};

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
        return {sub,lv:+lv,idx,answer:st.q.answers[st.q.correctIndex],hint:st.q.hint,text:st.q.question,options:st.q.answers.slice()};
      }
    return null;
  },needle).then(found=>{
    expect(found,`no question stem contains ${JSON.stringify(needle)}`).not.toBeNull();
    return found;
  });
}

function savedTeam(page){
  return page.evaluate(()=>{
    const box=JSON.parse(localStorage.getItem('pkq-save'));
    const kid=box.kids.find(k=>k.id===box.activeId)||box.kids[0];
    return kid.data.team.map(t=>t.num);
  });
}

async function checkAboveNav(page){
  await page.evaluate(()=>window.scrollTo(0,0));
  const check=await page.locator('[data-pad="check"]').boundingBox();
  const nav=await page.locator('#bottom-nav').boundingBox();
  expect(check).not.toBeNull();
  expect(check.y).toBeGreaterThanOrEqual(0);
  expect(check.y+check.height).toBeLessThanOrEqual(nav.y+1);
}

test.describe('kept progress',()=>{
  test.beforeEach(async({page})=>{
    await openGame(page);
    await startGame(page);
  });

  test('a catch is saved before the animation, and a reload keeps it',async({page})=>{
    await state(page,()=>{
      const pi=piByName('Pidgey');
      st.wild={pi,level:4,shiny:false,correctStreak:CATCH_STREAK_NEEDED,misses:0};
      st.phase='wild';
      st.tries=1;
      st.cor=true;
      render();
    });
    await page.click('#nxt');
    expect(await state(page,()=>st.team.map(t=>PKM[t.pi].n))).toContain('Pidgey');
    expect(await savedTeam(page)).toContain('#016');
    expect(await state(page,()=>st.phase)).toBe('play');
    await page.reload();
    expect(await state(page,()=>st.team.map(t=>PKM[t.pi].n))).toContain('Pidgey');
    expect(await state(page,()=>st.pdx[piByName('Pidgey')])).toBe(true);
  });

  test('an evolution is saved when the level-up happens, before the button or the animation',async({page})=>{
    await state(page,()=>{
      const tm=activeTM();
      tm.pi=0;
      tm.level=15;
      tm.xp=xpToNext(15);
      st.pendingEvo=null;
      st.phase='play';
      st.cor=true;
      st.tries=1;
      applyLevelUps();
      save();
      render();
    });
    expect(await state(page,()=>({pi:activeTM().pi,evo:!!st.pendingEvo,level:activeTM().level}))).toEqual({pi:0,evo:true,level:16});
    await expect(page.locator('#nxt')).toContainText("What's happening to Bulbasaur");
    expect(await savedTeam(page)).toContain('#002');
    await page.reload();
    expect(await state(page,()=>({name:PKM[activeTM().pi].n,evo:st.pendingEvo}))).toEqual({name:'Ivysaur',evo:null});
    expect(await state(page,()=>st.pdx[piByName('Ivysaur')])).toBe(true);
  });

  test('pressing the evolution button keeps the new Pokémon if the page reloads mid-animation',async({page})=>{
    await state(page,()=>{
      const tm=activeTM();
      tm.pi=0;
      tm.level=16;
      tm.xp=0;
      st.pendingEvo={fromPi:0,toPi:1};
      st.phase='play';
      st.cor=true;
      st.tries=1;
      render();
    });
    await page.click('#nxt');
    expect(await state(page,()=>PKM[activeTM().pi].n)).toBe('Ivysaur');
    expect(await savedTeam(page)).toContain('#002');
    await page.reload();
    expect(await state(page,()=>PKM[activeTM().pi].n)).toBe('Ivysaur');
  });
});

test.describe('fair questions',()=>{
  test.beforeEach(async({page})=>{
    await openGame(page);
    await startGame(page);
  });

  test('the reported questions each have one clear answer',async({page})=>{
    const autumn=await serveStem(page,'changes color and falls off trees in autumn');
    expect(autumn.options.slice().sort()).toEqual(['Feathers','Leaves','Rocks','Snow']);
    expect(autumn.answer).toBe('Leaves');
    expect(autumn.text.toLowerCase()).not.toContain('fruit');

    const capitalI=await serveStem(page,'uses capitals correctly');
    expect(capitalI.answer).toBe('Today I played outside.');
    expect(capitalI.options).toContain('today I played outside.');
    expect(capitalI.hint.toLowerCase()).toContain('sentence starts');

    const blank=await serveStem(page,'can go very');
    expect(blank.answer).toBe('Fast');
    expect(blank.options).toContain('Purple');
    expect(blank.text).not.toContain('is very');

    const puppy=await serveStem(page,'puppy share with the grown-up dog');
    expect(puppy.answer).toBe('Same body parts and features');
    expect(puppy.text.toLowerCase()).not.toContain('all young');

    const unwrap=await serveStem(page,'UN-wrap means');
    expect(unwrap.answer).toBe('Open by unwrapping');
    expect(unwrap.options).not.toContain('Not wrap');
    expect(unwrap.hint.toLowerCase()).not.toContain('un means the opposite');

    const prairie=await serveStem(page,'lives in grasslands and digs burrows');
    expect(prairie.answer).toBe('Prairie dog');
    expect(prairie.text.toLowerCase()).not.toContain('desert');
    expect(prairie.hint.toLowerCase()).toContain('grass');
  });

  test('the swept questions and the mismatched hints point at one answer',async({page})=>{
    const block=await serveStem(page,'rhymes with BLOCK');
    expect(block.answer).toBe('Clock');
    expect(block.hint).toContain('Say BLOCK');
    expect(block.hint.toLowerCase()).not.toContain('twig');

    const start=await serveStem(page,'capitalized correctly');
    expect(start.answer).toBe('The bird flew.');
    expect(start.hint).toContain('The rest of that word stays small');

    const share=await serveStem(page,'4 friends share 16 berries');
    expect(share.answer).toBe('4');
    expect(share.text.toLowerCase()).not.toContain('everyone');
    expect(share.hint.toLowerCase()).toContain('four friends');

    const swim=await serveStem(page,'webbed feet for swimming');
    expect(swim.answer).toBe('Duck');
    const sun=await serveStem(page,'color is the sun');
    expect(sun.answer).toBe('Yellow');
    expect(sun.hint.toLowerCase()).not.toContain('yellow');
    const frog=await serveStem(page,'catches bugs with its tongue');
    expect(frog.answer).toBe('Frog');
    const bear=await serveStem(page,'black bear live');
    expect(bear.answer).toBe('Forest');
    const ocean=await serveStem(page,'ocean all the time');
    expect(ocean.answer).toBe('Dolphin');
    const sky=await serveStem(page,'sky is');
    expect(sky.answer).toBe('blue');
    const pizza=await serveStem(page,'whole pizza');
    expect(pizza.answer).toBe('Circle');
  });
});

test.describe('phone and gym',()=>{
  test.beforeEach(async({page})=>{
    await openGame(page);
    await startGame(page);
  });

  test('using help for a whole Gym is not shown as a loss',async({page})=>{
    await state(page,()=>{
      st.stats.math.level=1;
      st.stats.math.cs=0;
      st.badges.math=[];
      st.gymOffer.math={tier:1,cool:0};
      st.cor=true;
      st.phase='play';
      render();
    });
    await page.click('[data-gym-start="math"]');
    const n=await state(page,()=>st.gym.queue.length);
    expect(n).toBeGreaterThan(0);
    for(let i=0;i<n;i++){
      await state(page,()=>{st.armAt=0;askForHelp();});
      await answer(page,true);
      if(i===0){
        await expect(page.locator('.gym-hint')).toContainText("doesn't hit the leader");
      }
      expect(await state(page,()=>({kid:st.gym.kid,lead:st.gym.lead}))).toEqual(await state(page,()=>({kid:GYM_KID_HP,lead:GYM_LEAD_HP})));
      await page.click('#nxt');
    }
    await expect(page.locator('.gym-end')).toContainText('not a loss');
    await expect(page.locator('.gym-end')).not.toContainText('Brave try');
    expect(await state(page,()=>({over:st.gym.over,cool:st.gymOffer.math.cool,kid:st.gym.kid,lead:st.gym.lead}))).toEqual(await state(page,()=>({
      over:'safe',cool:0,kid:GYM_KID_HP,lead:GYM_LEAD_HP,
    })));
    await page.click('#gym-back');
    await answer(page,true);
    await expect(page.locator('[data-gym-start="math"]')).toBeVisible();
  });

  test('Check stays above the Game bar on a phone',async({page})=>{
    for(const size of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
      await page.setViewportSize(size);
      await serveStem(page,'What is 25 + 10?');
      await checkAboveNav(page);
    }
    await page.setViewportSize({width:360,height:740});
    await serveStem(page,'What is 25 + 10?');
    const key=await page.locator('.pad-key').first().boundingBox();
    expect(key.height).toBeGreaterThanOrEqual(48);
  });

  test('an early tap says to hang on, and the next tap still counts once',async({page})=>{
    await serveStem(page,'rhymes with BLOCK');
    await state(page,()=>{st.armAt=Date.now()+60000;render();});
    await page.locator('.ans-btn').first().click();
    await expect(page.locator('.hang-on')).toHaveText('Hang on a second');
    expect(await state(page,()=>({tries:st.tries,cor:st.cor}))).toEqual({tries:0,cor:false});
    await state(page,()=>{st.armAt=0;});
    await page.locator('.ans-btn').first().click();
    expect(await state(page,()=>st.tries)).toBe(1);
  });

  test('Parents, the subject, and the name are big enough, and the resting tab is readable',async({page})=>{
    const subj=await page.locator('#subj-btn').boundingBox();
    const who=await page.locator('#who-btn').boundingBox();
    expect(subj.height).toBeGreaterThanOrEqual(44);
    expect(who.height).toBeGreaterThanOrEqual(44);
    await page.click('#nav-pdx');
    const parents=await page.locator('#parents-link').boundingBox();
    expect(parents.height).toBeGreaterThanOrEqual(44);
    const contrast=await page.locator('#nav-pdx').evaluate(el=>{
      const c=getComputedStyle(el).color;
      const [r,g,b]=c.match(/\d+/g).map(Number).map(v=>{
        v/=255;
        return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);
      });
      const L=0.2126*r+0.7152*g+0.0722*b;
      return {color:c,ratio:(1.05)/(L+0.05)};
    });
    expect(contrast.color).not.toBe('rgb(156, 163, 175)');
    expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('the sound switch mutes every effect and stays off after a reload',async({page})=>{
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed','false');
    await page.click('#mute-btn');
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#mute-btn')).toContainText('Off');
    expect(await page.evaluate(()=>localStorage.getItem('pkq-muted'))).toBe('1');
    await page.evaluate(()=>{_audioCtx=null;playSfx('throw');playSfx('gotcha');playSfx('shiny');});
    expect(await page.evaluate(()=>_audioCtx)).toBeNull();
    await page.reload();
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>localStorage.getItem('pkq-muted'))).toBe('1');
    await page.click('#mute-btn');
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed','false');
    expect(await page.evaluate(()=>localStorage.getItem('pkq-muted'))).toBe('0');
  });

  test('browser Back moves inside the game and leaves only from who is playing',async({page})=>{
    const q=await state(page,()=>st.q.question);
    await page.click('#subj-btn');
    await expect(page.locator('body')).toContainText('Starts after this question');
    await page.goBack();
    expect(await state(page,()=>st.q.question)).toBe(q);
    await expect(page.locator('#subj-btn')).toBeVisible();

    await page.click('#nav-pdx');
    await page.click('#parents-link');
    await expect(page.locator('#parent-q')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#pokedex-page')).toBeVisible();
    await expect(page.locator('#parent-q')).toHaveCount(0);

    await page.goBack();
    expect(await state(page,()=>st.q.question)).toBe(q);

    await page.goBack();
    await expect(page.getByText("Who's playing?")).toBeVisible();
    await page.goBack();
    expect(page.url()).not.toContain('index.html');
  });
});

test('an old save keeps the question on a phone, and the name is asked in trainer setup',async({page})=>{
  await page.setViewportSize({width:390,height:700});
  await openGame(page,{save:legacy});
  await expect(page.locator('#name-ask')).toHaveCount(0);
  const box=await page.locator('.qtext').boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(700);
  await page.click('#who-btn');
  await page.getByRole('button',{name:/^Edit/}).click();
  await expect(page.getByText("What's your name?")).toBeVisible();
  await page.fill('#profile-name','Maya');
  await page.click('#profile-save');
  expect(await state(page,()=>activeKid().name)).toBe('Maya');
  const boxSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')));
  expect(boxSave.kids[0].askName).toBeUndefined();
});

// The whole control, including its bottom edge, sits above the bar and takes the tap.
async function aboveBar(page,selector){
  await page.evaluate(()=>window.scrollTo(0,0));
  const box=await page.locator(selector).boundingBox();
  const nav=await page.locator('#bottom-nav').boundingBox();
  expect(box,selector).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(nav.y-(box.y+box.height)).toBeGreaterThanOrEqual(4);
  const hits=async(x,y)=>{
    return page.evaluate(({x,y,sel})=>{
      const el=document.elementFromPoint(x,y);
      const target=document.querySelector(sel);
      return !!(el&&target&&(el===target||target.contains(el)));
    },{x,y,sel:selector});
  };
  const inset=Math.min(12,box.width/2-1,box.height/2-1);
  expect(await hits(box.x+box.width/2,box.y+box.height/2),selector).toBe(true);
  expect(await hits(box.x+box.width/2,box.y+box.height-1),`${selector} bottom edge`).toBe(true);
  expect(await hits(box.x+box.width-inset,box.y+box.height-inset),`${selector} bottom corner`).toBe(true);
}

test('Check and Ask for help clear the bar on a sideways phone',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  const sizes=[
    {width:844,height:390},
    {width:667,height:375},
    {width:812,height:375},
    {width:932,height:430},
    {width:568,height:320},
    {width:700,height:320},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    await serveStem(page,'What is 25 + 10?');
    await aboveBar(page,'[data-pad="check"]');
    await aboveBar(page,'#help-btn');
  }
  await page.setViewportSize({width:568,height:320});
  await serveStem(page,'91 Pokemon cards');
  await aboveBar(page,'[data-pad="check"]');
  await aboveBar(page,'#help-btn');
  await page.setViewportSize({width:568,height:320});
  await serveStem(page,'What is 25 + 10?');
  await page.click('#help-btn');
  await expect(page.locator('.help-box')).toBeVisible();
  await expect(page.locator('#nav-game')).toHaveClass(/nav-active/);
  await expect(page.locator('#pokedex-page')).toBeHidden();
});

test('an old save shows the question without scrolling on a small or sideways phone',async({page})=>{
  const sizes=[
    {width:320,height:568},
    {width:844,height:390},
    {width:568,height:320},
    {width:667,height:375},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    await openGame(page,{save:legacy});
    await serveStem(page,'5 steps forward');
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect(page.locator('#name-ask')).toHaveCount(0);
    const q=await page.locator('.qtext').boundingBox();
    const nav=await page.locator('#bottom-nav').boundingBox();
    expect(q).not.toBeNull();
    expect(q.y).toBeGreaterThanOrEqual(0);
    expect(q.y+q.height).toBeLessThanOrEqual(size.height);
    expect(q.y+q.height).toBeLessThanOrEqual(nav.y+0.5);
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  }
});

test('the sound button never covers the subject button',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  const sizes=[
    {width:390,height:844},
    {width:320,height:568},
    {width:360,height:740},
    {width:844,height:390},
    {width:1024,height:768},
    {width:1280,height:800},
    {width:1440,height:900},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    for(const subject of ['math','reading','science']){
      await state(page,sub=>{chooseSubject(sub);st.phase='play';render();},subject);
      await page.evaluate(()=>window.scrollTo(0,0));
      const subj=await page.locator('#subj-btn').boundingBox();
      const mute=await page.locator('#mute-btn').boundingBox();
      const who=await page.locator('#who-btn').boundingBox();
      expect(subj).not.toBeNull();
      expect(mute).not.toBeNull();
      const gap=mute.x-(subj.x+subj.width);
      expect(gap,`${subject} at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(2);
      const yOverlap=Math.min(mute.y+mute.height,subj.y+subj.height)-Math.max(mute.y,subj.y);
      if(yOverlap>0) expect(gap).toBeGreaterThanOrEqual(2);
      const whoGap=mute.x-(who.x+who.width);
      const whoY=Math.min(mute.y+mute.height,who.y+who.height)-Math.max(mute.y,who.y);
      if(whoY>0) expect(whoGap).toBeGreaterThanOrEqual(2);
      const hitsSubject=await page.evaluate(({x,y})=>{
        const el=document.elementFromPoint(x,y);
        const target=document.getElementById('subj-btn');
        return !!(el&&target&&(el===target||target.contains(el)));
      },{x:subj.x+subj.width-3,y:subj.y+subj.height/2});
      expect(hitsSubject,`${subject} ${size.width}x${size.height}`).toBe(true);
    }
    const subj=await page.locator('#subj-btn').boundingBox();
    await page.mouse.click(subj.x+subj.width-3,subj.y+subj.height/2);
    await expect(page.getByText('What do you want to practice?')).toBeVisible();
    await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed','false');
    await state(page,()=>{st.phase='play';render();});
  }
});

test('adding a trainer does not leave a second Who\'s playing in Back',async({page})=>{
  await openGame(page);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('[data-avatar="001"]');
  await page.click('#profile-save');
  await expect(page.getByText('What do you want to practice?')).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.goBack();
  expect(page.url()).not.toContain('index.html');
});

test('muting stops a catch or evolution jingle that already started',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  const started=await page.evaluate(()=>{
    try{localStorage.setItem('pkq-muted','0');}catch(e){}
    _sfxNodes.splice(0,_sfxNodes.length);
    playSfx('gotcha');
    playSfx('evoStart');
    playSfx('evoDone');
    return _sfxNodes.length;
  });
  expect(started).toBeGreaterThan(0);
  await page.click('#mute-btn');
  await expect(page.locator('#mute-btn')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>_sfxNodes.length)).toBe(0);
  expect(await page.evaluate(()=>{playSfx('shiny');return _sfxNodes.length;})).toBe(0);
});

test('help after real Gym hits does not say nobody was touched',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    st.stats.math.level=1;
    st.stats.math.cs=0;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.cor=true;
    st.phase='play';
    render();
  });
  await page.click('[data-gym-start="math"]');
  const n=await state(page,()=>st.gym.queue.length);
  let i=0;
  while(i<n&&await state(page,()=>st.gym&&st.gym.lead>1)){
    await state(page,()=>{st.armAt=0;});
    await answer(page,true);
    await page.click('#nxt');
    i++;
  }
  expect(await state(page,()=>st.gym.lead)).toBe(1);
  for(;i<n;i++){
    await state(page,()=>{st.armAt=0;askForHelp();});
    await answer(page,true);
    await page.click('#nxt');
  }
  await expect(page.locator('.gym-end')).toContainText('You landed some hits');
  await expect(page.locator('.gym-end')).toContainText('badge waits');
  await expect(page.locator('.gym-end')).toContainText('Try the battle again');
  await expect(page.locator('.gym-end')).not.toContainText('Everybody still has hearts');
  await expect(page.locator('.gym-end')).not.toContainText("doesn't hit the leader");
  await expect(page.locator('.gym-end')).not.toContainText('Brave try');
  expect(await state(page,()=>({over:st.gym.over,cool:st.gymOffer.math.cool,lead:st.gym.lead,badges:st.badges.math.slice(),award:st.phase}))).toEqual({
    over:'safe',cool:0,lead:1,badges:[],award:'gym',
  });
  await page.click('#gym-back');
  await state(page,()=>{st.cor=true;st.phase='play';render();});
  await page.click('[data-gym-start="math"]');
  expect(await state(page,()=>st.gym.lead===GYM_LEAD_HP&&st.gym.kid===GYM_KID_HP&&st.badges.math.length===0)).toBe(true);
});
