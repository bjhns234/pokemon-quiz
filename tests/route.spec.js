// One route per math tier, drawn on the Round done screen.
// A finished round steps forward. Landing on a trainer, or waiting at a
// closed Gym door, ends in a battle instead of the bonus catch.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer}=require('./helpers');


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

function routeOf(page){
  return state(page,()=>st.route?{tier:st.route.tier|0,step:st.route.step|0}:{tier:0,step:-1});
}

// Six right of ten: the round finishes, and the bonus catch does not.
async function finishRound(page){
  await state(page,()=>{
    st.trainer=null;
    st.wild=null;
    st.wildEscape=false;
    st.bonusWild=false;
    st.pendingEvo=null;
    st.phase='play';
    st.streak=0;
    st.cor=false;
    st.tries=0;
    st.wrong=[];
    st.helped=false;
    Math.random=()=>0.99;
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=5;
    st.round.marks=[1,1,1,1,1,0,0,0,0];
    if(!st.q)loadQuestion();
  });
  await answer(page,true);
}

async function finishQualified(page){
  await state(page,()=>{
    st.trainer=null;
    st.wild=null;
    st.wildEscape=false;
    st.bonusWild=false;
    st.pendingEvo=null;
    st.phase='play';
    st.streak=0;
    st.cor=false;
    st.tries=0;
    st.wrong=[];
    st.helped=false;
    Math.random=()=>0.99;
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=6;
    st.round.marks=[1,1,1,1,1,1,0,0,0];
    if(!st.q)loadQuestion();
  });
  await answer(page,true);
}

async function showRound(page){
  await state(page,()=>{
    st.phase='round';
    st.trainer=null;
    st.wild=null;
    st.bonusWild=false;
    if(!st.round)st.round=freshRound(10);
    st.round.n=10;
    st.round.right=8;
    st.round.len=10;
    st.round.closed=true;
    st.round.marks=[1,1,1,1,1,1,1,1,0,0];
    st.round.xp=40;
    render();
  });
}

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  expect(m,'parent check should be a multiplication').not.toBeNull();
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

function kid(data){
  return {
    v:1,roster:1,activeId:'simon',
    kids:[{
      id:'simon',name:'Simon',avatar:'#001',
      data:Object.assign({
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
        items:{candy:1,great:0},
        settings:{grade:'auto',round:10},
      },data),
    }],
  };
}

test('a finished round steps forward once and stops at 6',async({page})=>{
  const errors=await boot(page);
  expect(await routeOf(page)).toEqual({tier:1,step:0});
  await finishRound(page);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('#route-map')).toBeVisible();
  expect(await routeOf(page)).toEqual({tier:1,step:1});
  await expect(page.locator('#route-label')).toHaveText('Route 1');
  await expect(page.locator('#route-caption')).toHaveText('Next stop: Youngster Joey!');
  await expect(page.locator('#round-line')).toContainText('6 of 10 right');
  await expect(page.locator('#round-xp')).toBeVisible();

  await state(page,()=>{st.armAt=0;});
  await page.click('#round-again');
  await finishRound(page);
  expect(await routeOf(page)).toEqual({tier:1,step:2});
  await expect(page.locator('#trainer-card')).toBeVisible();

  await state(page,()=>{
    st.trainer=null;
    st.phase='play';
    st.route.step=5;
    loadQuestion();
  });
  await finishRound(page);
  expect(await routeOf(page)).toEqual({tier:1,step:6});
  await state(page,()=>{
    st.trainer=null;
    st.phase='play';
    loadQuestion();
  });
  await finishRound(page);
  expect(await routeOf(page)).toEqual({tier:1,step:6});
  expect(errors).toEqual([]);
});

test('an unfinished round does not step, and Done after the map keeps the step',async({page})=>{
  const errors=await boot(page);
  await answer(page,true);
  await page.click('#nxt');
  await answer(page,true);
  expect(await routeOf(page)).toEqual({tier:1,step:0});
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Simon'}).click();
  expect(await routeOf(page)).toEqual({tier:1,step:0});

  await finishRound(page);
  expect(await routeOf(page)).toEqual({tier:1,step:1});
  await state(page,()=>{st.armAt=0;});
  await page.click('#round-done-exit');
  await expect(page.locator('#who-screen')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data);
  expect(saved.v).toBe(1);
  expect(saved.route.step).toBe(1);
  expect(saved.route.tier).toBe(1);
  await page.locator('[data-pick]').filter({hasText:'Simon'}).click();
  expect(await routeOf(page)).toEqual({tier:1,step:1});
  expect(errors).toEqual([]);
});

test('a warm-up or a silent drop never moves the route backward',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:2,step:4};
    st.stats.math.level=2;
    st.badges.math=[1];
    st.gymOffer.math=null;
  });
  await state(page,()=>beginWarmup('math'));
  expect(await routeOf(page)).toEqual({tier:2,step:4});
  expect(await state(page,()=>!!st.warmup)).toBe(true);

  await state(page,()=>{
    st.warmup=null;
    st.stats.math.level=2;
    st.badges.math=[1];
    st.log={
      '2026-11-17':{'math|@|2':'0'.repeat(10)},
      '2026-11-18':{'math|@|2':'0'.repeat(10)},
    };
    maybeAccuracyDrop('math');
  });
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  expect(await routeOf(page)).toEqual({tier:2,step:4});
  await finishRound(page);
  expect(await routeOf(page)).toEqual({tier:2,step:5});
  expect(errors).toEqual([]);
});

test('landing on step 2 or 5 battles, and steps 1, 3, and 4 do not',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:0};});
  await finishRound(page);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await routeOf(page)).toEqual({tier:1,step:1});

  await state(page,()=>{st.route.step=1;st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toContainText('Youngster Joey wants to battle!');
  await expect(page.locator('#trainer-card')).toContainText('Joey sends out Rattata!');
  expect(await state(page,()=>st.trainer.id)).toBe('joey');
  expect(await routeOf(page)).toEqual({tier:1,step:2});

  await state(page,()=>{st.trainer=null;st.route.step=2;st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  await expect(page.locator('#round-done')).toBeVisible();
  expect(await routeOf(page)).toEqual({tier:1,step:3});
  await expect(page.locator('#route-caption')).toHaveText('Next stop: grass!');

  await state(page,()=>{st.route.step=3;st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  await expect(page.locator('#route-caption')).toHaveText('Next stop: Lass Mia!');

  await state(page,()=>{st.route.step=4;st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toContainText('Lass Mia wants to battle!');
  expect(await state(page,()=>st.trainer.id)).toBe('mia');
  expect(await routeOf(page)).toEqual({tier:1,step:5});

  await state(page,()=>{
    st.trainer=null;
    st.route={tier:2,step:1};
    st.phase='play';
    loadQuestion();
  });
  await finishRound(page);
  expect(await state(page,()=>st.trainer.id)).toBe('sam');
  await expect(page.locator('#trainer-card')).toContainText('Bug Catcher Sam');
  expect(errors).toEqual([]);
});

test('a qualified round that is not a trainer round still offers the bonus catch',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:0};});
  await finishQualified(page);
  await expect(page.locator('.wild-card')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  expect(await routeOf(page)).toEqual({tier:1,step:1});

  await state(page,()=>{
    st.wild=null;st.bonusWild=false;st.phase='play';
    st.route.step=2;
    loadQuestion();
  });
  await finishQualified(page);
  await expect(page.locator('.wild-card')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await routeOf(page)).toEqual({tier:1,step:3});
  expect(errors).toEqual([]);
});

test('every round at a closed Gym door battles Ace Trainer Kim',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:5};st.badges.math=[];st.gymOffer.math=null;});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toContainText('Ace Trainer Kim wants to battle!');
  await expect(page.locator('#trainer-card')).toContainText('Kim sends out Lucario!');
  expect(await state(page,()=>st.trainer.id)).toBe('kim');
  const level=await state(page,()=>st.trainer.level|0);
  expect(level).toBeGreaterThanOrEqual(2);
  expect(level).toBeLessThanOrEqual(12);
  expect(await routeOf(page)).toEqual({tier:1,step:6});

  await state(page,()=>{st.trainer=null;st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toContainText('Ace Trainer Kim wants to battle!');
  expect(await routeOf(page)).toEqual({tier:1,step:6});

  await page.click('#trainer-go');
  await answer(page,true);
  await answer(page,true);
  await expect(page.locator('#trainer-result')).not.toContainText('Trainer star on your map');
  await expect(page.getByRole('button',{name:'See your map'})).toBeVisible();
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Lucario'))).toBe(false);
  expect(await state(page,()=> (st.trainerStars||[]).indexOf('kim') )).toBe(-1);
  expect(errors).toEqual([]);
});

test('a win stamps the trainer and the result says to see the map',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:1};st.trainerStars=[];});
  await finishRound(page);
  await page.click('#trainer-go');
  await answer(page,true);
  await answer(page,true);
  await expect(page.locator('#trainer-result')).toContainText('You beat Youngster Joey!');
  await expect(page.locator('#trainer-result')).toContainText('Trainer star on your map');
  await expect(page.locator('#trainer-result')).not.toContainText('You earned a trainer star!');
  await expect(page.getByRole('button',{name:'See your map'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Keep going'})).toHaveCount(0);
  const left=await state(page,()=>st.armAt-Date.now());
  expect(left).toBeGreaterThan(500);
  expect(left).toBeLessThanOrEqual(800);
  await page.click('#trainer-map');
  expect(await state(page,()=>st.phase)).toBe('trainer');
  await state(page,()=>{st.armAt=0;});
  await page.click('#trainer-map');
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('.route-node[data-step="2"]')).toHaveAttribute('data-star','1');
  await expect(page.locator('.route-node[data-step="2"]')).toContainText('⭐');
  expect(await state(page,()=>st.trainerStars.slice())).toEqual(['joey']);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data);
  expect(saved.v).toBe(1);
  expect(saved.trainerStars).toEqual(['joey']);
  expect(saved.route.step).toBe(2);
  expect(errors).toEqual([]);
});

test('a got-away screen also offers See your map',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:1};});
  await finishRound(page);
  await page.click('#trainer-go');
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await answer(page,false);
  await page.click('#trainer-next');
  await expect(page.locator('#trainer-result')).toContainText('Rattata ran back to Joey.');
  await expect(page.getByRole('button',{name:'See your map'})).toBeVisible();
  await expect(page.locator('.route-node[data-star="1"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Gym node shows partial progress toward mastery',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=1;
    st.badges.math=[];
    st.log={'2026-11-17':{'math|@|1':'1'.repeat(15)}};
    st.route={tier:1,step:3};
    loadQuestion();
  });
  await expect(page.locator('.mon-strip .gym-ring')).toHaveCount(0);
  await showRound(page);
  await expect(page.locator('#route-map .gym-ring')).toHaveAttribute('data-fill','0.500');
  await expect(page.locator('#route-map .gym-ring')).toHaveAttribute('data-state','partial');
  expect(errors).toEqual([]);
});

test('step 6 with the ring not full waits, with no Gym button',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:6};
    st.badges.math=[];
    st.gymOffer.math=null;
    st.log={};
  });
  await showRound(page);
  await expect(page.locator('#route-caption')).toHaveText('The Gym opens when the star is full.');
  await expect(page.locator('#route-gym')).toHaveCount(0);
  await expect(page.locator('#route-token')).toHaveAttribute('data-step','6');
  await expect(page.locator('.route-gym-label')).toHaveText('Gym');
  expect(errors).toEqual([]);
});

test('a full ring before the door is a shortcut into an open Gym',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:3};
    st.stats.math.level=1;
    st.badges.math=[];
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.gymOffer.math={tier:1,cool:0};
  });
  await finishRound(page);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('#route-caption')).toHaveText('Shortcut! The Gym is open!');
  await expect(page.locator('#route-gym')).toHaveText('Battle the Gym!');
  expect(await routeOf(page)).toEqual({tier:1,step:6});
  await expect(page.locator('#route-token')).toHaveAttribute('data-step','6');
  const lit=await page.locator('.route-node').evaluateAll(els=>els.map(el=>el.dataset.on));
  expect(lit).toEqual(['1','1','1','1','1','1','1']);
  expect(errors).toEqual([]);
});

test('an open Gym shows the battle button, then Play again and Done',async({page})=>{
  const errors=await boot(page);
  await page.setViewportSize({width:768,height:1024});
  await state(page,()=>{
    st.route={tier:1,step:6};
    st.stats.math.level=1;
    st.badges.math=[];
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.gymOffer.math={tier:1,cool:0};
  });
  await showRound(page);
  await expect(page.locator('#route-caption')).toHaveText('The Gym is open!');
  const gym=page.locator('#route-gym');
  await expect(gym).toHaveText('Battle the Gym!');
  const gymBox=await gym.boundingBox();
  const again=await page.locator('#round-again').boundingBox();
  const done=await page.locator('#round-done-exit').boundingBox();
  expect(gymBox.height).toBeGreaterThanOrEqual(74);
  expect(gymBox.height).toBeLessThanOrEqual(84);
  expect(again.height).toBeGreaterThanOrEqual(62);
  expect(again.height).toBeLessThanOrEqual(70);
  expect(done.height).toBeGreaterThanOrEqual(62);
  expect(done.height).toBeLessThanOrEqual(70);
  expect(gymBox.width).toBeGreaterThan(again.width+done.width-24);
  expect(Math.abs(again.y-done.y)).toBeLessThan(4);
  expect(again.y).toBeGreaterThan(gymBox.y+gymBox.height-4);
  expect(Math.abs(again.width-done.width)).toBeLessThan(8);

  await state(page,()=>{st.armAt=0;});
  await gym.click();
  await expect(page.locator('.gym-card')).toBeVisible();
  await expect(page.locator('.gym-card')).toContainText('Pikachu');
  expect(await state(page,()=>st.phase)).toBe('gym');
  expect(errors).toEqual([]);
});

test('winning the Gym starts the next route at step 0',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:4};
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.cor=true;
    st.phase='play';
    render();
  });
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;st.armAt=0;});
  await answer(page,true);
  await expect(page.locator('.award-card')).toBeVisible();
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await routeOf(page)).toEqual({tier:2,step:0});
  await state(page,()=>{st.armAt=0;});
  await page.click('#award-go');
  await finishRound(page);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('#route-caption')).toHaveText('New route! Route 2');
  await expect(page.locator('#route-label')).toHaveText('Route 2');
  expect(await routeOf(page)).toEqual({tier:2,step:1});
  await expect(page.locator('#route-token')).toHaveAttribute('data-step','1');
  expect(errors).toEqual([]);
});

test('losing the Gym leaves the token at the door until the cooldown ends',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:6};
    st.stats.math.level=1;
    st.badges.math=[];
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.gymOffer.math={tier:1,cool:0};
  });
  await showRound(page);
  await state(page,()=>{st.armAt=0;});
  await page.click('#route-gym');
  await expect(page.locator('.gym-card')).toBeVisible();
  await state(page,()=>{st.gym.kid=1;st.armAt=0;st.tries=0;st.helped=false;});
  await answer(page,false);
  await expect(page.locator('#gym-back')).toBeVisible();
  await page.click('#gym-back');
  expect(await routeOf(page)).toEqual({tier:1,step:6});
  expect(await state(page,()=>st.gymOffer.math.cool)).toBeGreaterThan(0);

  await showRound(page);
  await expect(page.locator('#route-gym')).toHaveCount(0);
  await expect(page.locator('#route-caption')).not.toHaveText('The Gym is open!');
  await expect(page.locator('#route-token')).toHaveAttribute('data-step','6');

  await state(page,()=>{st.gymOffer.math.cool=0;});
  await showRound(page);
  await expect(page.locator('#route-caption')).toHaveText('The Gym is open!');
  await expect(page.locator('#route-gym')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an old save starts at step 0, or at the door when the ring is already full',async({page})=>{
  const plain=kid({
    round:{n:4,right:3,len:10,marks:[1,1,1,0],xp:12},
    badges:{math:[],reading:[],science:[]},
  });
  let errors=await openGame(page,{save:plain});
  expect(await routeOf(page)).toEqual({tier:1,step:0});
  expect(await state(page,()=>({n:st.round.n,right:st.round.right,badge:st.badges.math.slice(),team:st.team[0]&&PKM[st.team[0].pi].n}))).toEqual({
    n:4,right:3,badge:[],team:'Bulbasaur',
  });
  expect(await state(page,()=>SAVE_V)).toBe(1);

  const full=kid({
    log:{'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}},
    stats:{
      math:{cor:40,att:40,level:1,cs:0,ws:0},
      reading:{cor:0,att:0,level:1,cs:0,ws:0},
      science:{cor:0,att:0,level:1,cs:0,ws:0},
    },
  });
  errors=await openGame(page,{save:full});
  expect(await routeOf(page)).toEqual({tier:1,step:6});
  expect(await state(page,()=>st.team[0]&&PKM[st.team[0].pi].n)).toBe('Bulbasaur');
  expect(errors).toEqual([]);
});

test('each child keeps a different route',async({page})=>{
  const save={
    v:1,roster:1,activeId:'simon',
    kids:[
      kid({route:{tier:1,step:4},trainerStars:['joey','mia','sam']}).kids[0],
      {
        id:'maya',name:'Maya',avatar:'#004',
        data:Object.assign({},kid({
          route:{tier:2,step:1},
          trainerStars:['joey'],
          team:[{num:'#004',level:6,xp:0}],
          dex:['#004'],
        }).kids[0].data),
      },
    ],
  };
  const errors=await openGame(page,{save});
  await page.locator('[data-pick]').filter({hasText:'Simon'}).click();
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await routeOf(page)).toEqual({tier:2,step:1});
  expect(await state(page,()=>st.trainerStars.slice())).toEqual(['joey']);
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Simon'}).click();
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  expect(await state(page,()=>st.trainerStars.slice())).toEqual(['joey','mia','sam']);
  expect(errors).toEqual([]);
});

test('a grade lock ends on the badge, and door battles keep going',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.grade=1;
    st.stats.math.level=1;
    st.badges.math=[1];
    st.route={tier:1,step:6};
    st.gymOffer.math=null;
  });
  await showRound(page);
  await expect(page.locator('#route-caption')).toHaveText('You have the Bolt Badge!');
  await expect(page.locator('#route-gym')).toHaveCount(0);
  await expect(page.locator('#route-map .route-badge')).toContainText('Bolt Badge');
  await state(page,()=>{st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#trainer-card')).toContainText('Ace Trainer Kim');
  expect(await routeOf(page)).toEqual({tier:1,step:6});
  expect(errors).toEqual([]);
});

test('a full ring at the door climbs without inventing a Gym battle',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:6};
    st.stats.math.level=1;
    st.badges.math=[1];
    st.grade=0;
    st.gymOffer.math=null;
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.redo={math:{tier:1,fresh:40}};
    maybeMasteryAdvance('math');
  });
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await state(page,()=>st.phase)).not.toBe('gym');
  expect(await state(page,()=>st.gym)).toBe(null);
  expect(await routeOf(page)).toEqual({tier:2,step:0});

  await state(page,()=>{
    st.route={tier:1,step:4};
    st.stats.math.level=1;
    st.badges.math=[1];
    st.redo={math:{tier:1,fresh:40}};
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    maybeMasteryAdvance('math');
  });
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  expect(errors).toEqual([]);
});

test('climbing back onto this route does not send him home',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:2,step:6};
    st.stats.math.level=1;
    st.badges.math=[1];
    st.grade=0;
    st.gymOffer.math=null;
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.redo={math:{tier:1,fresh:40}};
    maybeMasteryAdvance('math');
  });
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await routeOf(page)).toEqual({tier:2,step:6});
  expect(await state(page,()=>st.phase)).not.toBe('gym');
  expect(errors).toEqual([]);
});

test('a silent climb at the door introduces the new route from the house',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:6};
    st.stats.math.level=1;
    st.badges.math=[1];
    st.grade=0;
    st.gymOffer.math=null;
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.redo={math:{tier:1,fresh:40}};
    maybeMasteryAdvance('math');
  });
  expect(await routeOf(page)).toEqual({tier:2,step:0});
  expect(await state(page,()=>!!st.route.debut)).toBe(true);
  await showRound(page);
  await expect(page.locator('#route-label')).toHaveText('Route 2');
  await expect(page.locator('#route-caption')).toHaveText('New route! Route 2');
  await expect(page.locator('#route-token')).toHaveAttribute('data-step','0');
  expect(await routeOf(page)).toEqual({tier:2,step:0});
  expect(errors).toEqual([]);
});

test('a climb before the door starts the new route when he reaches the door',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:4};
    st.stats.math.level=1;
    st.badges.math=[1];
    st.grade=0;
    st.gymOffer.math=null;
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.redo={math:{tier:1,fresh:40}};
    maybeMasteryAdvance('math');
  });
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  await state(page,()=>{st.route.step=5;st.phase='play';loadQuestion();});
  await finishRound(page);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('#route-caption')).toHaveText('New route! Route 2');
  await expect(page.locator('#route-label')).toHaveText('Route 2');
  expect(await routeOf(page)).toEqual({tier:2,step:1});
  await expect(page.locator('#route-gym')).toHaveCount(0);
  await expect(page.locator('#trainer-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a reload still owes the trainer battle after a held evolution or a held wild',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:1};
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=5;
    st.round.marks=[1,1,1,1,1,0,0,0,0];
    st.pendingEvo={fromPi:activeTM().pi,toPi:activeTM().pi+1};
    st.phase='play';
    st.cor=false;st.tries=0;st.wrong=[];
    if(!st.q)loadQuestion();
  });
  await answer(page,true);
  expect(await state(page,()=>!!(st.round&&st.round.battleOwed))).toBe(true);
  expect(await state(page,()=>st.phase)).not.toBe('trainer');
  expect(await state(page,()=>st.round.right)).toBe(6);
  await page.reload();
  await expect(page.locator('#trainer-card')).toContainText('Youngster Joey wants to battle!');
  expect(await state(page,()=>st.trainer&&st.trainer.id)).toBe('joey');

  await state(page,()=>{
    st.trainer=null;
    st.pendingEvo=null;
    st.route={tier:1,step:1};
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=5;
    st.round.marks=[1,1,1,1,1,0,0,0,0];
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild={pi,level:6,shiny:false,correctStreak:1,misses:0};
    st.phase='wild';
    st.bonusWild=false;
    loadQuestion();
  });
  await answer(page,true);
  expect(await state(page,()=>st.phase)).toBe('wild');
  expect(await state(page,()=>!!(st.round&&st.round.battleOwed))).toBe(true);
  expect(await state(page,()=>st.round.right)).toBe(6);
  await page.reload();
  await expect(page.locator('#trainer-card')).toContainText('Youngster Joey wants to battle!');
  expect(errors).toEqual([]);
});

test('the Parents report has one read-only route line under the Gym line',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:4};
    st.trainerStars=['joey','mia','sam'];
    save();
  });
  await openParents(page);
  const gym=page.locator('.prog-gym');
  const line=page.locator('.prog-route');
  await expect(line).toHaveText('Route 1: step 4 of 6. Trainers beaten: 3 so far.');
  const gymBox=await gym.boundingBox();
  const lineBox=await line.boundingBox();
  expect(lineBox.y).toBeGreaterThanOrEqual(gymBox.y+gymBox.height-2);
  expect(await line.evaluate(el=>el.querySelector('button,input,select'))).toBeNull();
  expect(errors).toEqual([]);
});

test('a reload keeps the route',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:3};});
  await finishRound(page);
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  await page.reload();
  expect(await routeOf(page)).toEqual({tier:1,step:4});
  await showRound(page);
  await expect(page.locator('#route-caption')).toHaveText('Next stop: Lass Mia!');
  await expect(page.locator('#route-token')).toHaveAttribute('data-step','4');
  expect(errors).toEqual([]);
});

test('the map fits an iPad and a phone without scrolling',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:4};
    st.round={n:10,right:8,len:10,marks:[1,1,1,1,1,1,1,1,0,0],xp:40,bonus:{name:'Pidgey',caught:true},closed:true};
  });
  await showRound(page);
  const sizes=[
    {width:768,height:1024},
    {width:1024,height:768},
    {width:1194,height:834},
    {width:1133,height:744},
    {width:390,height:844},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    const where=`${size.width}x${size.height}`;
    const fit=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      const map=document.getElementById('route-map').getBoundingClientRect();
      const summary=document.querySelector('.round-summary').getBoundingClientRect();
      const caption=document.getElementById('route-caption');
      const cs=getComputedStyle(caption);
      const label=document.querySelector('.route-label');
      const gym=document.querySelector('.route-gym-label');
      const small=[];
      const root=document.getElementById('route-map');
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let node;const seen=new Set();
      while((node=walker.nextNode())){
        if(!node.textContent||!node.textContent.trim())continue;
        const el=node.parentElement;
        if(!el||seen.has(el))continue;
        seen.add(el);
        const s=getComputedStyle(el);
        if(s.display==='none'||s.visibility==='hidden')continue;
        const r=el.getBoundingClientRect();
        if(r.width<2||r.height<2)continue;
        const px=parseFloat(s.fontSize);
        if(px<18)small.push(node.textContent.trim().slice(0,24)+' '+px);
      }
      const nodes=[...document.querySelectorAll('.route-node')].map(el=>el.getBoundingClientRect());
      const token=document.getElementById('route-token').getBoundingClientRect();
      const again=document.getElementById('round-again').getBoundingClientRect();
      const taps=[again,document.getElementById('round-done-exit').getBoundingClientRect()];
      return {
        scroll:main.scrollHeight-main.clientHeight,
        map,summary,token,
        caption:parseFloat(cs.fontSize),
        weight:cs.fontWeight,
        label:parseFloat(getComputedStyle(label).fontSize),
        gym:parseFloat(getComputedStyle(gym).fontSize),
        small,
        nodes,
        taps:taps.map(r=>Math.min(r.width,r.height)),
        nodePtr:getComputedStyle(document.querySelector('.route-node')).pointerEvents,
      };
    });
    expect(fit.scroll,where).toBeLessThanOrEqual(4);
    expect(fit.caption,where).toBe(24);
    expect(Number(fit.weight),where).toBeGreaterThanOrEqual(700);
    expect(fit.label,where).toBeGreaterThanOrEqual(18);
    expect(fit.gym,where).toBeGreaterThanOrEqual(18);
    expect(fit.small,where).toEqual([]);
    expect(fit.nodePtr,where).toBe('none');
    expect(fit.taps.every(n=>n>=44),where).toBe(true);
    if(size.width>=768&&size.height>size.width){
      expect(fit.map.width,where).toBeGreaterThanOrEqual(540);
      expect(fit.map.width,where).toBeLessThanOrEqual(620);
      expect(fit.map.height,where).toBeGreaterThanOrEqual(480);
      expect(fit.map.height,where).toBeLessThanOrEqual(560);
      expect(fit.map.y,where).toBeGreaterThan(fit.summary.y+20);
      expect(fit.nodes[0].width,where).toBeGreaterThanOrEqual(56);
      expect(fit.nodes[0].width,where).toBeLessThanOrEqual(64);
      const ring=await page.locator('#route-map .gym-ring').boundingBox();
      expect(ring.width,where).toBeGreaterThanOrEqual(106);
      expect(ring.width,where).toBeLessThanOrEqual(114);
      expect(fit.token.width,where).toBeGreaterThanOrEqual(68);
      expect(fit.token.width,where).toBeLessThanOrEqual(76);
    }
    if(size.width>=1000&&size.height<size.width){
      expect(fit.map.x,where).toBeGreaterThan(fit.summary.x+fit.summary.width-8);
      expect(fit.map.width,where).toBeGreaterThanOrEqual(430);
      expect(fit.map.width,where).toBeLessThanOrEqual(490);
      expect(fit.map.height,where).toBeGreaterThanOrEqual(400);
      expect(fit.map.height,where).toBeLessThanOrEqual(470);
    }
    if(size.width<500){
      expect(fit.nodes[0].width,where).toBeGreaterThanOrEqual(34);
      expect(fit.nodes[0].width,where).toBeLessThanOrEqual(40);
      expect(fit.token.width,where).toBeGreaterThanOrEqual(44);
      expect(fit.token.width,where).toBeLessThanOrEqual(52);
      const ys=fit.nodes.map(n=>n.y);
      expect(Math.max(...ys)-Math.min(...ys),where).toBeLessThan(6);
      expect(fit.map.y,where).toBeGreaterThan(fit.summary.y);
      await state(page,()=>{
        st.route.step=6;
        st.badges.math=[];
        st.gymOffer.math=null;
        st.log={};
        render();
      });
      const door=await page.evaluate(()=>{
        const cap=document.getElementById('route-caption');
        const main=document.getElementById('app-main');
        return {
          text:cap.textContent,
          scrollW:document.documentElement.scrollWidth,
          inner:window.innerWidth,
          v:main.scrollHeight-main.clientHeight,
          capL:cap.getBoundingClientRect().left,
          capR:cap.getBoundingClientRect().right,
        };
      });
      expect(door.text,where).toBe('The Gym opens when the star is full.');
      expect(door.scrollW,where).toBeLessThanOrEqual(door.inner+1);
      expect(door.capL,where).toBeGreaterThanOrEqual(-1);
      expect(door.capR,where).toBeLessThanOrEqual(door.inner+1);
      expect(door.v,where).toBeLessThanOrEqual(4);
    }
  }
  expect(errors).toEqual([]);
});

test('a phone route does not scroll sideways',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.route={tier:1,step:6};st.badges.math=[];st.gymOffer.math=null;st.log={};});
  await showRound(page);
  for(const size of [{width:390,height:844},{width:375,height:667}]){
    await page.setViewportSize(size);
    const where=`${size.width}x${size.height}`;
    const fit=await page.evaluate(()=>{
      const map=document.getElementById('route-map').getBoundingClientRect();
      const cap=document.getElementById('route-caption').getBoundingClientRect();
      const main=document.getElementById('app-main');
      return {
        scrollW:document.documentElement.scrollWidth,
        inner:window.innerWidth,
        mapL:map.left,mapR:map.right,
        capL:cap.left,capR:cap.right,
        vscroll:main.scrollHeight-main.clientHeight,
      };
    });
    expect(fit.scrollW,where).toBeLessThanOrEqual(fit.inner+1);
    expect(fit.mapL,where).toBeGreaterThanOrEqual(-1);
    expect(fit.mapR,where).toBeLessThanOrEqual(fit.inner+1);
    expect(fit.capL,where).toBeGreaterThanOrEqual(-1);
    expect(fit.capR,where).toBeLessThanOrEqual(fit.inner+1);
    expect(fit.vscroll,where).toBeLessThanOrEqual(4);
  }
  expect(errors).toEqual([]);
});

test('round done leads with the checks and a plus on the XP',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.route={tier:1,step:1};
    st.round={n:10,right:6,len:10,marks:[1,0,1,0,1,1,0,1,1,0],xp:40,closed:true};
    st.phase='round';
    render();
  });
  const shown=await page.locator('.round-mark').evaluateAll(els=>els.map(el=>el.textContent.trim()));
  expect(shown).toEqual(['✓','✓','✓','✓','✓','✓','○','○','○','○']);
  await expect(page.locator('#round-xp')).toHaveText('+40 XP');
  expect(errors).toEqual([]);
});

test('the route caption names each stop',async({page})=>{
  test.setTimeout(180000);
  const errors=await boot(page);

  await state(page,()=>{
    st.route={tier:1,step:4};
    st.trainerStars=['joey'];
    st.log={'2026-11-17':{'math|@|1':'1'.repeat(15)}};
  });
  await showRound(page);
  await expect(page.locator('#route-caption')).toHaveText('Next stop: Lass Mia!');

  await state(page,()=>{
    st.route={tier:1,step:6};
    st.log={'2026-11-17':{'math|@|1':'1'.repeat(15)}};
    st.badges.math=[];
    st.gymOffer.math=null;
    render();
  });
  await expect(page.locator('#route-caption')).toHaveText('The Gym opens when the star is full.');
  await page.setViewportSize({width:375,height:667});

  await state(page,()=>{
    st.route={tier:1,step:6};
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    render();
  });
  await expect(page.locator('#route-caption')).toHaveText('The Gym is open!');
  await page.setViewportSize({width:390,height:844});

  await state(page,()=>{
    st.route={tier:1,step:3};
    st.log={'2026-11-16':{'math|@|1':'1'.repeat(20)},'2026-11-17':{'math|@|1':'1'.repeat(20)}};
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.phase='play';
    loadQuestion();
  });
  await finishRound(page);
  await expect(page.locator('#route-caption')).toHaveText('Shortcut! The Gym is open!');
  await page.setViewportSize({width:390,height:844});

  await state(page,()=>{
    st.stats.math.level=2;
    st.badges.math=[1];
    st.route={tier:2,step:0,announce:'new',debut:false};
    st.gymOffer.math=null;
    render();
  });
  await expect(page.locator('#route-caption')).toHaveText('New route! Route 2');

  await state(page,()=>{
    st.route={tier:1,step:1,announce:null};
    st.stats.math.level=1;
    st.phase='play';
    loadQuestion();
  });
  await finishRound(page);
  await page.click('#trainer-go');
  await answer(page,true);
  await answer(page,true);
  await expect(page.locator('#trainer-result')).toContainText('Trainer star on your map');

  await state(page,()=>{st.armAt=0;});
  await page.click('#trainer-map');
  await state(page,()=>{
    st.route={tier:1,step:4};
    st.trainerStars=['joey','mia','sam'];
    save();
  });
  await openParents(page);
  await page.locator('.prog-route').scrollIntoViewIfNeeded();
  await expect(page.locator('.prog-route')).toHaveText('Route 1: step 4 of 6. Trainers beaten: 3 so far.');
  expect(errors).toEqual([]);
});
