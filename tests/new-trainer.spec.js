// Adding a trainer uses the same starter chooser as the first run.
// Name first, then Choose your starter, then the same reveal.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer}=require('./helpers');

async function kidSnap(page){
  return page.evaluate(()=>{
    const raw=localStorage.getItem('pkq-save');
    if(!raw)return [];
    const box=JSON.parse(raw);
    return (box.kids||[]).map(k=>({
      id:k.id,
      name:k.name,
      avatar:k.avatar,
      data:k.data==null?null:JSON.stringify(k.data),
      settings:k.settings==null?null:JSON.stringify(k.settings),
    }));
  });
}
async function rawSave(page){
  return page.evaluate(()=>localStorage.getItem('pkq-save'));
}
// The kid object as it is written in pkq-save, not a fresh stringify.
function kidSlice(raw,id){
  const at=raw.indexOf(`"id":"${id}"`);
  if(at<0)throw new Error(`no kid ${id}`);
  let start=raw.lastIndexOf('{',at);
  let depth=0,inStr=false,esc=false;
  for(let i=start;i<raw.length;i++){
    const c=raw[i];
    if(inStr){
      if(esc)esc=false;
      else if(c==='\\')esc=true;
      else if(c==='"')inStr=false;
      continue;
    }
    if(c==='"')inStr=true;
    else if(c==='{')depth++;
    else if(c==='}'){
      depth--;
      if(depth===0)return raw.slice(start,i+1);
    }
  }
  throw new Error(`unclosed kid ${id}`);
}

async function nameMaya(page){
  await startGame(page,'math');
  await answer(page,true);
  await state(page,()=>{
    const kid=activeKid();
    kid.name='Maya';
    kid.askName=false;
    st.items.candy=3;
    st.stats.math.level=4;
    st.grade=3;
    st.roundPref=15;
    if(st.round)st.round.len=15;
    save();
  });
}

test('a fresh tablet names the trainer before the same starter chooser',async({page})=>{
  const errors=await openGame(page);
  await expect(page.getByText('Add a trainer to start.')).toBeVisible();
  await page.click('#profile-new');
  await expect(page.getByText("What's your name?")).toBeVisible();
  await expect(page.locator('#who-form-back')).toHaveCount(0);
  await expect(page.locator('.ava-grid')).toHaveCount(0);
  await expect(page.getByText('Tap the Pokémon you want to play with.')).toHaveCount(0);
  await expect(page.getByText('Type a name and tap a Pokémon.')).toHaveCount(0);
  await expect(page.locator('#profile-next')).toBeDisabled();
  const fieldPx=await page.locator('#profile-name').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(fieldPx).toBeGreaterThanOrEqual(18);
  expect(fieldPx).toBeLessThanOrEqual(20);
  await page.fill('#profile-name','   ');
  await expect(page.locator('#profile-next')).toBeDisabled();
  await page.fill('#profile-name','Maya');
  await expect(page.locator('#profile-next')).toBeEnabled();
  await page.click('#profile-next');

  await expect(page.locator('.starter-card')).toBeVisible();
  await expect(page.locator('.starter-card')).toContainText('Choose your starter!');
  await expect(page.locator('.starter-card')).toContainText('Pick your partner for this learning adventure');
  await expect(page.locator('#pick-random')).toHaveText(/Surprise me/);
  await expect(page.locator('.starter-opt')).toHaveCount(27);
  await expect(page.locator('.gen-section')).toHaveCount(9);
  await expect(page.locator('.gen-label').first()).toContainText('Kanto');
  await expect(page.locator('.gen-label').nth(8)).toContainText('Paldea');
  const sprite=await page.locator('.starter-opt img').first().evaluate(el=>({w:el.getAttribute('width'),h:el.getAttribute('height')}));
  expect(sprite).toEqual({w:'64',h:'64'});
  await expect(page.locator('.starter-opt-type')).toHaveCount(27);
  await expect(page.locator('#starter-back')).toBeVisible();
  await expect(page.locator('.new-trainer-pill')).toHaveText('New trainer');
  await expect(page.locator('#who-btn')).toHaveCount(0);
  await expect(page.locator('#bottom-nav')).toBeHidden();
  const names=await page.locator('.starter-opt-name').allTextContents();
  expect(names).toContain('Bulbasaur');
  expect(names).toContain('Sprigatito');
  expect(names).toContain('Fuecoco');
  expect(names).toContain('Quaxly');
  expect(names).not.toContain('Pikachu');
  expect(names).not.toContain('Eevee');
  expect(await kidSnap(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a second trainer gets the same starter card as the fresh one',async({page})=>{
  const errors=await openGame(page);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('#profile-next');
  const fresh=await page.locator('.starter-card').innerHTML();
  await page.evaluate(()=>pickStarter(0,false));
  await expect(page.locator('.qtext')).toBeVisible();
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  const again=await page.locator('.starter-card').innerHTML();
  const strip=html=>html.replace(/<button[^>]*id="starter-back"[\s\S]*?<\/button>/g,'').replace(/<span class="new-trainer-pill">[\s\S]*?<\/span>/g,'');
  expect(strip(again)).toBe(strip(fresh));
  expect(again).toBe(fresh);
  await expect(page.locator('#starter-back')).toBeVisible();
  await expect(page.locator('.new-trainer-pill')).toHaveText('New trainer');
  expect(errors).toEqual([]);
});

test('reset still opens that chooser, and both taps call the same reveal',async({page})=>{
  const errors=await openGame(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await nameMaya(page);
  await page.evaluate(()=>resetCurrentProfile());
  await expect(page.locator('.starter-card')).toContainText('Choose your starter!');
  await expect(page.locator('#who-btn')).toContainText('Maya');
  await expect(page.locator('#starter-back')).toHaveCount(0);
  await expect(page.locator('.new-trainer-pill')).toHaveCount(0);
  const resetCard=await page.locator('.starter-card').innerHTML();

  await page.evaluate(()=>{
    window.__calls=[];
    const reveal=playStarterReveal;
    const choose=choosePickedStarter;
    const paint=render;
    playStarterReveal=function(line,shiny,done){
      window.__calls.push('playStarterReveal');
      done();
    };
    choosePickedStarter=function(line){
      window.__calls.push('choosePickedStarter');
      return choose.call(this,line);
    };
    render=function(){
      window.__calls.push('render');
      return paint.apply(this,arguments);
    };
  });
  await page.click('#pick-0');
  await expect(page.locator('.qtext')).toBeVisible();
  const resetCalls=await state(page,()=>window.__calls.filter(n=>n!=='render'));
  expect(resetCalls).toEqual(['choosePickedStarter','playStarterReveal']);

  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  const addCard=await page.locator('.starter-card').innerHTML();
  expect(addCard).toBe(resetCard);
  await state(page,()=>{window.__calls=[];});
  await page.click('#pick-1');
  await expect(page.locator('.qtext')).toBeVisible();
  const addCalls=await state(page,()=>window.__calls.filter(n=>n!=='render'));
  expect(addCalls).toEqual(['choosePickedStarter','playStarterReveal']);
  expect(await state(page,()=>typeof beginWithPokemon)).toBe('undefined');
  await expect(page.locator('.ava-grid')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a tap plays the reveal, then the first question, with the typed name',async({page})=>{
  test.setTimeout(30000);
  const errors=await openGame(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('#profile-next');
  await state(page,()=>{rollShiny=()=>true;});
  await page.click('#pick-0');
  await expect(page.locator('#pick-overlay.active')).toBeVisible();
  const offered=await page.locator('#pick-overlay .big-back, #pick-overlay #starter-back').count();
  expect(offered).toBe(0);
  await expect(page.locator('.shiny-fanfare')).toBeVisible({timeout:12000});
  await expect(page.locator('#pick-label')).toContainText('is your Pokémon');
  await expect(page.locator('.qtext')).toBeVisible({timeout:15000});
  await expect(page.locator('#who-btn')).toContainText('Maya');
  const got=await state(page,()=>({
    name:activeKid().name,
    starter:st.starter,
    team:st.team.map(t=>({num:PKM[t.pi].num,level:t.level,shiny:!!t.shiny})),
    kids:profiles.kids.map(k=>k.name),
  }));
  expect(got).toEqual({
    name:'Maya',
    starter:0,
    team:[{num:'#001',level:5,shiny:true}],
    kids:['Maya'],
  });
  expect(errors).toEqual([]);
});

test('back keeps the name and writes no trainer, including browser Back',async({page})=>{
  const errors=await openGame(page);
  await nameMaya(page);
  const before=await kidSnap(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await expect(page.locator('#starter-back')).toBeVisible();
  expect(await kidSnap(page)).toEqual(before);
  await page.click('#starter-back');
  await expect(page.getByText("What's your name?")).toBeVisible();
  await expect(page.locator('#profile-name')).toHaveValue('Leo');
  await expect(page.locator('.starter-card')).toBeHidden();
  expect((await kidSnap(page)).map(k=>k.name)).toEqual(['Maya']);
  expect(await kidSnap(page)).toEqual(before);

  await page.click('#profile-next');
  await page.goBack();
  await expect(page.locator('#profile-name')).toHaveValue('Leo');
  await expect(page.getByText("What's your name?")).toBeVisible();
  expect(await kidSnap(page)).toEqual(before);
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  expect((await kidSnap(page)).map(k=>k.name)).toEqual(['Maya']);
  expect(await kidSnap(page)).toEqual(before);

  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#who-form-back');
  await expect(page.getByText("Who's playing?")).toBeVisible();
  expect(await kidSnap(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('closing mid-choice leaves no extra kid',async({page})=>{
  const errors=await openGame(page);
  await nameMaya(page);
  const before=await kidSnap(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.reload();
  // One saved trainer resumes her game. The half-typed name is not a kid.
  expect(await kidSnap(page)).toEqual(before);
  expect(await state(page,()=>activeKid().name)).toBe('Maya');

  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await expect(page.locator('.starter-card')).toBeVisible();
  const parked=await kidSnap(page);
  expect(parked.map(k=>k.name)).toEqual(['Maya']);
  expect(parked[0].id).toBe(before[0].id);
  await page.reload();
  const after=await kidSnap(page);
  expect(after.map(k=>k.name)).toEqual(['Maya']);
  expect(after[0].data).toBe(parked[0].data);
  expect(await state(page,()=>activeKid().name)).toBe('Maya');
  await expect(page.locator('[data-pick]').filter({hasText:'Leo'})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the other trainer stays byte-identical if the new one finishes or backs out',async({page})=>{
  const errors=await openGame(page);
  await nameMaya(page);
  const before=await kidSnap(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await page.click('#starter-back');
  await page.click('#who-form-back');
  expect(await kidSnap(page)).toEqual(before);

  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await page.evaluate(()=>pickStarter(0,false));
  await expect(page.locator('.qtext')).toBeVisible();
  const after=await kidSnap(page);
  expect(after.find(k=>k.name==='Maya')).toEqual(before[0]);
  const leo=await state(page,()=>{
    const d=activeKid().data;
    return {
      name:activeKid().name,
      grade:d.settings.grade,
      round:d.settings.round,
      level:d.stats.math.level,
      num:d.team[0].num,
      lv:d.team[0].level,
      starter:d.starter,
    };
  });
  expect(leo).toEqual({name:'Leo',grade:'auto',round:10,level:1,num:'#001',lv:5,starter:0});
  expect(errors).toEqual([]);
});

test('two kids can share a starter, including Surprise me',async({page})=>{
  const errors=await openGame(page);
  await nameMaya(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','maya');
  await expect(page.locator('#profile-err')).toContainText('Someone is already called Maya. Pick a different name.');
  await expect(page.locator('#profile-next')).toBeDisabled();
  await page.fill('#profile-name','Leo');
  await expect(page.locator('#profile-err')).toBeHidden();
  await page.click('#profile-next');
  await expect(page.locator('.starter-opt.muted, .starter-opt.taken, .sibling-tag')).toHaveCount(0);
  await state(page,()=>{
    window.__line=null;
    const orig=playStarterReveal;
    playStarterReveal=function(line,shiny,done){
      window.__line=line;
      done();
    };
    Math.random=()=>0;
    orig;
  });
  await page.click('#pick-random');
  await expect(page.locator('.qtext')).toBeVisible();
  expect(await state(page,()=>window.__line)).toBe(0);
  expect(await state(page,()=>PKM[st.team[0].pi].n)).toBe('Bulbasaur');
  await page.click('#who-btn');
  const maya=page.locator('[data-pick]').filter({hasText:'Maya'});
  const leo=page.locator('[data-pick]').filter({hasText:'Leo'});
  await expect(maya).toContainText('Bulbasaur');
  await expect(leo).toContainText('Bulbasaur');
  await expect(maya).toContainText('Lv 5');
  await expect(leo).toContainText('Lv 5');
  expect(errors).toEqual([]);
});

test('Back, New trainer, and sound fit on a phone',async({page})=>{
  const errors=await openGame(page);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('#profile-next');
  for(const width of [375,390]){
    await page.setViewportSize({width,height:width===375?667:844});
    const fit=await page.evaluate(()=>{
      const sels=['#starter-back','.new-trainer-pill','#mute-btn'];
      const vw=document.documentElement.clientWidth;
      const vh=document.documentElement.clientHeight;
      const boxes=sels.map(sel=>{
        const el=document.querySelector(sel);
        const r=el.getBoundingClientRect();
        return {sel,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
      });
      return {vw,vh,boxes};
    });
    for(const box of fit.boxes){
      expect(box.left,`${box.sel} left at ${width}`).toBeGreaterThanOrEqual(-1);
      expect(box.right,`${box.sel} right at ${width}`).toBeLessThanOrEqual(fit.vw+1);
      expect(box.top,`${box.sel} top at ${width}`).toBeGreaterThanOrEqual(-1);
      expect(box.width,`${box.sel} width at ${width}`).toBeGreaterThan(24);
    }
    const [back,pill,mute]=fit.boxes;
    expect(back.height,`Back height at ${width}`).toBeGreaterThanOrEqual(44);
    expect(back.width,`Back stays content-sized at ${width}`).toBeLessThan(fit.vw*0.45);
    expect(mute.right,`sound inset at ${width}`).toBeLessThanOrEqual(fit.vw-4);
    for(const [a,b] of [[back,pill],[back,mute],[pill,mute]]){
      const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
      const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      expect(overlapX>1&&overlapY>1,`${a.sel} overlaps ${b.sel} at ${width}`).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});

test('park and Back leave the raw save untouched, including a third kid',async({page})=>{
  const errors=await openGame(page);
  await nameMaya(page);
  await state(page,()=>{
    profiles.kids.push(
      {id:'sam',name:'Sam',avatar:'#004',data:{v:1,starter:1,activeIdx:0,team:[{num:'#004',level:8,xp:2,shiny:false}],dex:['#004'],items:{candy:9,great:1},stats:{math:{cor:4,att:5,level:2,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},settings:{grade:2,round:5}}},
      {id:'noa',name:'Noa',avatar:'#007',data:{v:1,starter:2,activeIdx:0,team:[{num:'#007',level:6,xp:1,shiny:false}],dex:['#007'],items:{candy:1,great:0},stats:{math:{cor:1,att:1,level:3,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},badges:{math:[1,2]},settings:{grade:'auto',round:15},log:{}}},
    );
    writeRoster();
  });
  const before=await rawSave(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await page.click('#starter-back');
  await page.click('#who-form-back');
  expect(await rawSave(page)).toBe(before);

  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await page.evaluate(()=>pickStarter(4,false));
  await expect(page.locator('.qtext')).toBeVisible();
  const after=await rawSave(page);
  expect(kidSlice(after,'sam')).toBe(kidSlice(before,'sam'));
  expect(kidSlice(after,'noa')).toBe(kidSlice(before,'noa'));
  expect(kidSlice(after,'sam')).not.toBe(kidSlice(after,'noa'));
  const leo=JSON.parse(after).kids.find(k=>k.name==='Leo').data;
  expect(leo.stats.math.level).toBe(1);
  expect(leo.settings).toEqual({grade:'auto',round:10});
  expect(leo.items.candy).toBe(0);
  expect(leo.route).toEqual({tier:1,step:0});
  expect(leo.log).toEqual({});
  expect(leo.bestStreak).toBe(0);
  expect(leo.round&&leo.round.battleOwed).toBeFalsy();
  expect(leo.team).toEqual([{num:'#155',level:5,xp:0,shiny:false}]);
  expect(errors).toEqual([]);
});

test('browser Back and a reload during the reveal leave the raw save alone',async({page})=>{
  test.setTimeout(20000);
  const errors=await openGame(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await nameMaya(page);
  const before=await rawSave(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  expect(await rawSave(page)).toBe(before);
  await page.click('#pick-0');
  await expect(page.locator('#pick-overlay.active')).toBeVisible();
  await page.goBack();
  expect(await rawSave(page)).toBe(before);
  expect(JSON.parse(await rawSave(page)).kids.map(k=>k.name)).toEqual(['Maya']);
  await expect(page.locator('#profile-name')).toHaveValue('Leo');

  await page.click('#profile-next');
  await page.click('#pick-0');
  await expect(page.locator('#pick-overlay.active')).toBeVisible();
  await page.reload();
  expect(await rawSave(page)).toBe(before);
  expect(JSON.parse(await rawSave(page)).kids.map(k=>k.name)).toEqual(['Maya']);
  expect(errors).toEqual([]);
});

test('Surprise me can land on any of the 27, even a sibling\'s',async({page})=>{
  const errors=await openGame(page);
  await nameMaya(page);
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('#profile-next');
  await state(page,()=>{
    window.__lines=[];
    playStarterReveal=line=>{window.__lines.push(line);};
  });
  for(const value of [0,0.5,0.999999]){
    await state(page,value=>{Math.random=()=>value;},value);
    await page.click('#pick-random');
  }
  expect(await state(page,()=>window.__lines)).toEqual([0,13,26]);
  expect(await state(page,()=>GENS.reduce((a,g)=>a.concat(g),[]).length)).toBe(27);
  expect(errors).toEqual([]);
});

test('iPad cards and Back are big, and phones do not overflow',async({page})=>{
  const errors=await openGame(page);
  await page.setViewportSize({width:768,height:1024});
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('#profile-next');
  const card=await page.locator('.starter-opt').first().boundingBox();
  expect(card.height).toBeGreaterThanOrEqual(100);
  const typePx=await page.locator('.starter-opt-type').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  const namePx=await page.locator('.starter-opt-name').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(namePx).toBeGreaterThanOrEqual(18);
  expect(typePx).toBeGreaterThanOrEqual(14);
  const back=await page.locator('#starter-back').boundingBox();
  expect(back.height).toBeGreaterThanOrEqual(64);
  for(const size of [{width:390,height:844},{width:375,height:667}]){
    await page.setViewportSize(size);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow,`${size.width}x${size.height}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('a legacy Trainer still gets the name chip, and six is still the cap',async({page})=>{
  const legacy={v:1,starter:0,activeIdx:0,team:[{num:'#025',level:7,xp:1}],dex:['#025'],
    stats:{math:{cor:1,att:1,level:1,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}}};
  const errors=await openGame(page,{save:legacy});
  await expect(page.locator('#who-btn')).toContainText('Your name?');
  expect(await state(page,()=>PKM[st.team[0].pi].n)).toBe('Pikachu');

  await page.evaluate(()=>{
    profiles.kids=[];
    profiles.activeId=null;
    for(let i=0;i<6;i++){
      profiles.kids.push({id:'k'+i,name:'Kid'+i,avatar:'#001',data:{v:1,starter:0,activeIdx:0,team:[{num:'#001',level:5,xp:0}],stats:{math:{level:1}}}});
    }
    whoMode='list';
    renderWho();
  });
  await expect(page.locator('#profile-new')).toHaveCount(0);
  await expect(page.getByText('This tablet already has 6 trainers.')).toBeVisible();
  expect(errors).toEqual([]);
});
