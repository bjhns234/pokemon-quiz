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

test('an old save keeps the question on a phone while it asks for a name',async({page})=>{
  await page.setViewportSize({width:390,height:700});
  await openGame(page,{save:legacy});
  await expect(page.locator('#name-ask')).toContainText("What's your name?");
  const box=await page.locator('.qtext').boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(700);
  await page.click('#name-ask-save');
  expect(await state(page,()=>activeKid().name)).toBe('Trainer');
  await page.fill('#name-ask-input','Maya');
  await page.click('#name-ask-save');
  await expect(page.locator('#name-ask')).toHaveCount(0);
  expect(await state(page,()=>activeKid().name)).toBe('Maya');
});
