// One tablet, several kids. Profiles keep the saves apart, an old single save
// becomes the first trainer, and the parent page reads each kid's own record.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,serve}=require('./helpers');

const legacy={v:1,starter:0,activeIdx:0,team:[{num:'#001',level:7,xp:3}],dex:['#001'],
  stats:{math:{cor:5,att:6,level:2,cs:1,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
  review:[{sub:'math',lv:1,idx:0,q:'What is 1 + 2?',wins:0}]};

async function newTrainer(page,name,avatar){
  await page.click('#profile-new');
  await page.fill('#profile-name',name);
  await page.click(`[data-avatar="${avatar}"]`);
  await page.click('#profile-save');
}

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*\+\s*(\d+)/);
  expect(m,'parent check should be a simple addition').not.toBeNull();
  await page.fill('#parent-answer',String(Number(m[1])+Number(m[2])));
  await page.click('#parent-go');
}

test('an old single save becomes the first trainer and is not mixed with a new one',async({page})=>{
  const errors=await openGame(page,{save:legacy});
  // One existing player goes straight back in. They should not have to make a
  // profile before they can see the game they already had.
  expect(await state(page,()=>st.phase)).toBe('play');
  expect(await state(page,()=>st.team.map(t=>[PKM[t.pi].num,t.level]))).toEqual([['#001',7]]);
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math],cor:st.stats.math.cor}))).toEqual({level:2,badges:[1],cor:5});
  expect(await state(page,()=>st.review.map(r=>reviewKey(r)))).toEqual(['math/1/0']);
  await expect(page.locator('#who-screen')).toHaveCount(0);

  const box=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')));
  expect(box.roster).toBe(1);
  expect(box.team).toBeUndefined();
  expect(box.kids).toHaveLength(1);
  expect(box.kids[0].name).toBe('Trainer');
  expect(box.kids[0].avatar).toBe('#001');
  expect(box.kids[0].data.team[0].num).toBe('#001');
  expect(box.kids[0].data.stats.math.cor).toBe(5);
  expect(errors).toEqual([]);

  await page.reload();
  expect(await state(page,()=>({phase:st.phase,level:st.team[0].level,cor:st.stats.math.cor,review:st.review.map(r=>reviewKey(r))}))).toEqual({
    phase:'play',level:7,cor:5,review:['math/1/0'],
  });

  await page.click('#who-btn');
  await newTrainer(page,'Leo','004');
  await page.evaluate(()=>{pickStarter(1,false);chooseSubject('math');});
  expect(await state(page,()=>({name:activeKid().name,team:st.team.map(t=>PKM[t.pi].num),cor:st.stats.math.cor,badges:[...st.badges.math]}))).toEqual({
    name:'Leo',team:['#004'],cor:0,badges:[],
  });

  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')));
  const first=stored.kids.find(k=>k.name==='Trainer');
  expect(first.data.team[0].num).toBe('#001');
  expect(first.data.stats.math.cor).toBe(5);
  expect(first.data.team.map(t=>t.num)).not.toContain('#004');
});

test('two trainers keep separate Pokémon, and deleting one takes a confirm',async({page})=>{
  const errors=await openGame(page);
  await expect(page.locator('#who-screen')).toBeVisible();
  await expect(page.getByText('Choose your starter')).toHaveCount(0);

  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('[data-avatar="001"]');
  await page.click('#profile-save');
  await expect(page.getByText('Choose your starter')).toBeVisible();
  await page.evaluate(()=>{pickStarter(0,false);chooseSubject('math');});
  await serve(page,{sub:'math',lv:1,idx:0});
  await answer(page,true);
  await state(page,()=>{st.stats.math.level=2;st.badges.math=[1];st.items.candy=2;save();});

  await page.click('#who-btn');
  await newTrainer(page,'Leo','004');
  await page.evaluate(()=>{pickStarter(1,false);chooseSubject('reading');});
  const leo=await state(page,()=>({
    name:activeKid().name,
    team:st.team.map(t=>[PKM[t.pi].num,t.level]),
    candy:st.items.candy,
    cor:st.stats.math.cor,
    badges:[...st.badges.math],
    dex:st.pdx.filter(Boolean).length,
  }));
  expect(leo).toEqual({name:'Leo',team:[['#004',5]],candy:0,cor:0,badges:[],dex:1});

  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  const maya=await state(page,()=>({
    name:activeKid().name,
    team:st.team.map(t=>PKM[t.pi].num),
    candy:st.items.candy,
    cor:st.stats.math.cor,
    badges:[...st.badges.math],
  }));
  expect(maya.name).toBe('Maya');
  expect(maya.team).toEqual(['#001']);
  expect(maya.candy).toBe(2);
  expect(maya.cor).toBeGreaterThanOrEqual(1);
  expect(maya.badges).toEqual([1]);

  await page.reload();
  await expect(page.locator('#who-screen')).toBeVisible();
  await expect(page.locator('.qtext')).toHaveCount(0);
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await state(page,()=>st.items.candy)).toBe(2);
  expect(await state(page,()=>PKM[st.team[0].pi].num)).toBe('#001');

  await page.click('#who-btn');
  await page.getByRole('button',{name:'Remove Leo'}).click();
  await expect(page.locator('#remove-confirm')).toContainText('Delete Leo?');
  await expect(page.locator('[data-pick]').filter({hasText:'Leo'})).toHaveCount(0);
  await page.click('#remove-no');
  await expect(page.locator('[data-pick]').filter({hasText:'Leo'})).toBeVisible();
  await expect(page.locator('[data-pick]').filter({hasText:'Maya'})).toBeVisible();

  await page.getByRole('button',{name:'Remove Leo'}).click();
  await page.click('#remove-yes');
  await expect(page.locator('[data-pick]').filter({hasText:'Leo'})).toHaveCount(0);
  await expect(page.locator('[data-pick]').filter({hasText:'Maya'})).toBeVisible();
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await state(page,()=>({candy:st.items.candy,num:PKM[st.team[0].pi].num,badges:[...st.badges.math]}))).toEqual({
    candy:2,num:'#001',badges:[1],
  });

  const left=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids.map(k=>k.name));
  expect(left).toEqual(['Maya']);
  expect(errors).toEqual([]);
});

test('resetting one trainer does not wipe the other',async({page})=>{
  const errors=await openGame(page);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('[data-avatar="001"]');
  await page.click('#profile-save');
  await page.evaluate(()=>{pickStarter(0,false);chooseSubject('math');});
  await state(page,()=>{st.items.candy=3;save();});

  await page.click('#who-btn');
  await newTrainer(page,'Leo','004');
  await page.evaluate(()=>{pickStarter(1,false);chooseSubject('math');});
  await state(page,()=>{st.items.great=4;save();});

  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await state(page,()=>st.items.candy)).toBe(3);

  await page.click('#nav-pdx');
  const btn=page.locator('#reset-btn');
  const box=await btn.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  expect(await state(page,()=>st.items.candy)).toBe(3);
  expect(await state(page,()=>st.team.length)).toBe(1);

  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
  expect(await state(page,()=>st.phase)).toBe('starter');
  expect(await state(page,()=>st.team.length)).toBe(0);
  expect(await state(page,()=>activeKid().name)).toBe('Maya');

  const kids=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids.map(k=>({name:k.name,great:k.data&&k.data.items&&k.data.items.great,team:k.data&&k.data.team})));
  const leo=kids.find(k=>k.name==='Leo');
  const maya=kids.find(k=>k.name==='Maya');
  expect(leo.great).toBe(4);
  expect(leo.team[0].num).toBe('#004');
  expect(maya.team).toBeNull();
  expect(errors).toEqual([]);
});

test('four trainers fit, and a reload asks who is playing',async({page})=>{
  const errors=await openGame(page);
  const names=[['Maya','001'],['Leo','004'],['Sam','025'],['Noa','722']];
  for(const [name,avatar] of names){
    if(name!=='Maya')await page.click('#who-btn');
    await page.click('#profile-new');
    await page.fill('#profile-name',name);
    await page.click(`[data-avatar="${avatar}"]`);
    await page.click('#profile-save');
  }
  await page.click('#who-btn');
  for(const [name] of names){
    await expect(page.locator('[data-pick]').filter({hasText:name})).toBeVisible();
  }
  await expect(page.locator('#profile-new')).toBeVisible();
  let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({width:360,height:740});
  overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for(const [name] of names){
    await expect(page.locator('[data-pick]').filter({hasText:name})).toBeVisible();
  }

  await page.reload();
  await expect(page.locator('#who-screen')).toBeVisible();
  await expect(page.locator('.qtext')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the parent page stays behind a math check and shows each child apart',async({page})=>{
  const maya={
    v:1,activeIdx:0,team:[{num:'#001',level:6,xp:1,shiny:false}],
    stats:{math:{cor:8,att:10,level:2,cs:0,ws:0},reading:{cor:1,att:4,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
    badges:{math:[1],reading:[],science:[]},
    review:[{sub:'math',lv:1,idx:0,q:'What is 1 + 2?',wins:0}],
    practice:{
      recent:[{s:'math',ok:1},{s:'math',ok:0},{s:'math',ok:0},{s:'math',ok:1},{s:'reading',ok:0}],
      topics:{
        'math|Adding':{n:2,ex:['What is 8 + 7?']},
        'reading|Rhyming':{n:1,ex:['Which word rhymes with CAT?']},
      },
    },
  };
  const sam={
    v:1,activeIdx:0,team:[{num:'#004',level:9,xp:0}],
    stats:{math:{cor:3,att:5,level:3,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:2,att:2,level:1,cs:0,ws:0}},
    badges:{math:[1,2],reading:[],science:[]},
    review:[],
  };
  const errors=await openGame(page,{save:{v:1,roster:1,activeId:null,kids:[
    {id:'maya',name:'Maya',avatar:'#001',data:maya},
    {id:'sam',name:'Sam',avatar:'#004',data:sam},
  ]}});
  await expect(page.locator('#who-screen')).toBeVisible();
  expect(await page.locator('#bottom-nav #parents-link').count()).toBe(0);
  await expect(page.locator('#parents-link')).toBeVisible();

  await page.click('#parents-link');
  await expect(page.locator('#parent-report')).toHaveCount(0);
  await expect(page.locator('#parent-q')).toBeVisible();
  await page.fill('#parent-answer','0');
  await page.click('#parent-go');
  await expect(page.locator('#parent-report')).toHaveCount(0);
  await expect(page.locator('#parent-err')).toBeVisible();

  await passParentGate(page);
  const mayaCard=page.locator('[data-kid-name="Maya"]');
  const samCard=page.locator('[data-kid-name="Sam"]');
  await expect(mayaCard).toContainText('1st-grade adding and subtracting');
  await expect(mayaCard).toContainText('Bolt Badge');
  await expect(mayaCard).toContainText('8 right out of 10');
  await expect(mayaCard).toContainText('Last 5 answers: 2 right');
  await expect(mayaCard).toContainText('Adding');
  await expect(mayaCard).toContainText('missed 2 times');
  await expect(mayaCard).toContainText('What is 8 + 7?');
  await expect(mayaCard).toContainText('Rhyming');
  await expect(mayaCard).toContainText('Trying these again');
  await expect(mayaCard).toContainText('What is 1 + 2?');
  await expect(mayaCard).not.toContainText('Charge Badge');
  await expect(mayaCard).not.toContainText('Missed topics start from this update');

  await expect(samCard).toContainText('2nd-grade bigger numbers, time, and money');
  await expect(samCard).toContainText('Bolt Badge');
  await expect(samCard).toContainText('Charge Badge');
  await expect(samCard).toContainText('3 right out of 5');
  await expect(samCard).toContainText('Missed topics start from this update');
  await expect(samCard).not.toContainText('What is 8 + 7?');
  await expect(samCard).not.toContainText('Rhyming');
  expect(errors).toEqual([]);
});

test('a miss is remembered for the parent page from the next answer on',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await serve(page,{sub:'math',lv:1,idx:0});
  expect(await state(page,()=>st.q.question)).toContain('1 + 2');
  await answer(page,false);
  await page.click('#parents-link');
  await passParentGate(page);
  const card=page.locator('[data-kid-name="Trainer"]');
  await expect(card).toContainText('Adding');
  await expect(card).toContainText('missed 1 time');
  await expect(card).toContainText('What is 1 + 2?');
  await expect(card).toContainText('Last 1 answer: 0 right');
  await expect(card).not.toContainText('Missed topics start from this update');
  expect(errors).toEqual([]);
});

test('questions can be described to a parent in plain topics',async({page})=>{
  await openGame(page);
  const samples=await page.evaluate(()=>{
    const fallback=new Set(['Math questions','Reading questions','Science questions','Questions']);
    const out=[];
    SUBS.forEach(sub=>{
      Object.keys(QB[sub]).forEach(lv=>{
        QB[sub][lv].forEach(q=>{
          const topic=questionTopic(sub,q[0]);
          if(!topic||fallback.has(topic))out.push(`${sub} ${lv}: ${q[0]}`);
        });
      });
    });
    return out;
  });
  expect(samples).toEqual([]);
});
