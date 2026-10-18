// Gym Leaders gate a difficulty step. Three clean answers in a subject unlock a
// battle for the tier he is already on; the next tier opens only after a win.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,nextQuestion,pinXp}=require('./helpers');

let errors;
test.beforeEach(async({page})=>{
  errors=await openGame(page);
  await startGame(page);
});
test.afterEach(()=>expect(errors,'uncaught page errors').toEqual([]));

async function offerGym(page,sub,tier){
  await state(page,({sub,tier})=>{
    st.stats[sub].level=tier;
    st.stats[sub].cs=0;
    st.badges[sub]=st.badges[sub].filter(t=>t<tier);
    st.gymOffer[sub]={tier,cool:0};
    st.cor=true;
    render();
  },{sub,tier});
}

test('the battle stays locked until the open question is finished',async({page})=>{
  await state(page,()=>{
    st.stats.math.level=1;
    st.gymOffer.math={tier:1,cool:0};
    st.cor=false;
    render();
  });
  await expect(page.locator('[data-gym-start="math"]')).toHaveCount(0);
  await expect(page.locator('.gym-wait')).toContainText('Finish this question first');
  await state(page,()=>{st.cor=true;render();});
  await expect(page.locator('[data-gym-start="math"]')).toBeVisible();
});

test('Not now hides the invite without starting a cooldown',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-later="math"]');
  await expect(page.locator('[data-gym-start="math"]')).toHaveCount(0);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});
  await nextQuestion(page);
  await state(page,()=>{st.cor=true;render();});
  await expect(page.locator('[data-gym-start="math"]')).toBeVisible();
});

test('a win opens the next tier, awards the badge, and pays the prizes',async({page})=>{
  await pinXp(page);
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  const battle=await state(page,()=>({
    phase:st.phase,sub:st.q.subject,tier:st.q.tmpl.lv,n:st.gym.queue.length,
    kid:st.gym.kid,lead:st.gym.lead,leader:GYM_LEADER.math,
  }));
  expect(battle).toEqual(await state(page,()=>({phase:'gym',sub:'math',tier:1,n:GYM_QUESTIONS,kid:GYM_KID_HP,lead:GYM_LEAD_HP,leader:GYM_LEADER.math})));
  await expect(page.locator('.gym-name')).toHaveText('Pikachu');

  const before=await state(page,()=>activeTM().xp);
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  const pay=await state(page,()=>xpForStreak(1));
  const after=await state(page,()=>({
    phase:st.phase,level:st.stats.math.level,badges:[...st.badges.math],
    candy:st.items.candy,great:st.items.great,xp:activeTM().xp,
    partner:st.team.map(t=>[PKM[t.pi].num,t.level,!!t.shiny]),
  }));
  expect(after.phase).toBe('award');
  expect(after.level).toBe(2);
  expect(after.badges).toEqual([1]);
  expect(after.candy).toBe(1);
  expect(after.great).toBe(1);
  expect(after.xp-before).toBe(pay+await state(page,()=>GYM_BONUS_XP));
  expect(after.partner).toContainEqual(['#025',await state(page,()=>GYM_PARTNER_LEVEL),false]);
  await expect(page.locator('[data-badge="math-1"]')).toContainText('Bolt Badge');
  await expect(page.locator('.award-card')).toContainText('joined your team');
  await expect(page.locator('.award-card')).toContainText('Rare Candy');
  await expect(page.locator('.award-card')).toContainText('Great Ball');
  await expect(page.locator('body')).not.toContainText(/Level|Grade|defeated|you lost/i);

  await page.click('#award-go');
  expect(await state(page,()=>st.phase)).toBe('play');
  await page.reload();
  expect(await state(page,()=>({
    phase:st.phase,level:st.stats.math.level,badges:[...st.badges.math],
    candy:st.items.candy,great:st.items.great,award:st.award,
    hasPika:st.team.some(t=>PKM[t.pi].num==='#025'),
  }))).toEqual({phase:'play',level:2,badges:[1],candy:1,great:1,award:null,hasPika:true});
});

test('a Gym the family already fills sends a shiny, and both colours send an extra candy',async({page})=>{
  await pinXp(page);
  const pika=await state(page,()=>piByName('Pikachu'));
  await state(page,pi=>{st.team.push({pi,level:4,xp:0,shiny:false});},pika);
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  expect(await state(page,()=>st.team.filter(t=>PKM[t.pi].n==='Pikachu').map(t=>!!t.shiny).sort())).toEqual([false,true]);

  await state(page,()=>{st.phase='play';st.award=null;});
  await offerGym(page,'reading',1);
  // Reading's partner is Eevee. Own both colours first.
  const eevee=await state(page,()=>piByName('Eevee'));
  await state(page,pi=>{
    st.team.push({pi,level:4,xp:0,shiny:false});
    st.team.push({pi,level:4,xp:0,shiny:true});
    st.items.candy=0;
    render();
  },eevee);
  await page.click('[data-gym-start="reading"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  expect(await state(page,()=>st.items.candy)).toBe(2);
  expect(await state(page,()=>st.team.filter(t=>PKM[t.pi].n==='Eevee').length)).toBe(2);
  await expect(page.locator('.award-card')).toContainText('extra Rare Candy');
});

test('a loss is gentle, keeps the tier, and unlocks a rematch after practice',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.kid=1;});
  await answer(page,false);
  expect(await state(page,()=>({phase:st.phase,level:st.stats.math.level,over:st.gym.over,cool:st.gymOffer.math.cool,badges:[...st.badges.math]}))).toEqual(await state(page,()=>({
    phase:'gym',level:1,over:'lose',cool:GYM_COOLDOWN,badges:[],
  })));
  await expect(page.locator('.gym-end')).toContainText('Brave try');
  await expect(page.locator('body')).not.toContainText(/defeated|you lost|game over/i);
  await page.click('#gym-back');
  expect(await state(page,()=>st.phase)).toBe('play');
  await expect(page.locator('[data-gym-start="math"]')).toHaveCount(0);

  const need=await state(page,()=>GYM_COOLDOWN); // practice answers before the Gym will try again
  for(let i=0;i<need;i++){
    await answer(page,true);
    expect(await state(page,()=>st.gymOffer.math.cool)).toBe(need-1-i);
    if(i<need-1)await nextQuestion(page);
  }
  await expect(page.locator('[data-gym-start="math"]')).toBeVisible();
});

test('forfeiting between questions is a loss, and an open question cannot be quit',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await expect(page.locator('#gym-forfeit')).toHaveCount(0);
  await answer(page,true);
  expect(await state(page,()=>st.gym.lead)).toBe(await state(page,()=>GYM_LEAD_HP-1));
  await page.click('#gym-forfeit');
  expect(await state(page,()=>({level:st.stats.math.level,cool:st.gymOffer.math.cool}))).toEqual(await state(page,()=>({level:1,cool:GYM_COOLDOWN})));
});

test('a Gym miss shows the text hint and no picture, and help deals no damage',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    const idx=QB.math[1].findIndex(q=>q[0].includes('What is 2 + 2?'));
    st.gym.queue[st.gym.qi]=idx;
    dealGymQuestion();
  });
  const hint=await state(page,()=>st.q.hint);
  await answer(page,false);
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  await expect(page.locator('.gym-hint')).toContainText(hint);
  expect(await state(page,()=>st.gym.kid)).toBe(await state(page,()=>GYM_KID_HP-1));

  await state(page,()=>{st.gym.kid=GYM_KID_HP;st.gym.lead=GYM_LEAD_HP;st.streak=4;});
  await state(page,()=>{
    const idx=QB.math[1].findIndex(q=>q[0].includes('What is 2 + 2?'));
    st.gym.qi=0;
    st.gym.queue[st.gym.qi]=idx;
    dealGymQuestion();
    st.streak=4;
  });
  await page.click('#help-btn');
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  await expect(page.locator('.help-box')).toContainText(hint);
  await answer(page,true);
  expect(await state(page,()=>({lead:st.gym.lead,kid:st.gym.kid,streak:st.streak}))).toEqual(await state(page,()=>({lead:GYM_LEAD_HP,kid:GYM_KID_HP,streak:4})));
});

test('a typed answer in a Gym damages the leader and still pays a streak',async({page})=>{
  await pinXp(page);
  await offerGym(page,'math',3);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    let idx=-1;
    for(let i=0;i<QB.math[3].length;i++){
      if(isTypedQuestion(serveQuestion('math',3,i,questionPname()))){idx=i;break;}
    }
    st.gym.queue[st.gym.qi]=idx;
    dealGymQuestion();
  });
  expect(await state(page,()=>isTypedQuestion(st.q))).toBe(true);
  await expect(page.locator('.numpad')).toBeVisible();
  const before=await state(page,()=>activeTM().xp);
  await state(page,()=>{st.armAt=0;submitTyped(st.q.answers[st.q.correctIndex]);});
  expect(await state(page,()=>st.gym&&st.gym.lead)).toBe(await state(page,()=>GYM_LEAD_HP-1));
  expect(await state(page,()=>st.streak)).toBe(1);
  expect(await state(page,()=>activeTM().xp)).toBe(before+await state(page,()=>xpForStreak(1)));
});

test('the timer is only on harder tiers, and running it out is a miss',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await expect(page.locator('#gym-time')).toHaveCount(0);

  await state(page,()=>{st.phase='play';st.gym=null;st.cor=true;});
  await offerGym(page,'math',2);
  await page.click('[data-gym-start="math"]');
  await expect(page.locator('#gym-time')).toHaveCount(0);

  await state(page,()=>{st.phase='play';st.gym=null;st.cor=true;});
  await offerGym(page,'math',3);
  await page.click('[data-gym-start="math"]');
  await expect(page.locator('#gym-time')).toBeVisible();
  await expect(page.locator('.gym-time-lbl')).toHaveText('Thinking time');
  const label=await page.locator('#gym-time').innerText();
  expect(label).not.toMatch(/\d/);

  await state(page,()=>{st.armAt=Date.now()-GYM_TIMER_MS;});
  await expect.poll(()=>state(page,()=>st.tries)).toBeGreaterThan(0);
  expect(await state(page,()=>st.gym.kid)).toBe(await state(page,()=>GYM_KID_HP-1));
});

test('a parent can turn the Gym timer off, and the choice sticks',async({page})=>{
  await page.click('#nav-pdx');
  await page.click('#grownups-btn');
  await page.click('[data-gate-digit="4"]');
  await page.click('[data-gate="ok"]');
  await expect(page.locator('.gate-note')).toContainText('grown-up');
  expect(await state(page,()=>st.gate)).toBe('ask');

  await page.click('[data-gate="erase"]');
  await page.click('[data-gate-digit="6"]');
  await page.click('[data-gate-digit="3"]');
  await page.click('[data-gate="ok"]');
  await expect(page.locator('#timer-toggle')).toBeChecked();
  await page.click('#timer-toggle');
  expect(await state(page,()=>st.timerOff)).toBe(true);
  await page.reload();
  expect(await state(page,()=>st.timerOff)).toBe(true);

  await state(page,()=>{st.phase='play';st.cor=true;st.stats.math.level=3;st.gymOffer.math={tier:3,cool:0};render();});
  await page.click('#nav-game');
  await page.click('[data-gym-start="math"]');
  await expect(page.locator('#gym-time')).toHaveCount(0);
  expect(await state(page,()=>SAVE_V)).toBe(1);
});

test('a Gym miss still comes back as a Rematch',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    st.gym.queue[st.gym.qi]=0;
    dealGymQuestion();
  });
  const key=await state(page,()=>reviewKey(st.q.tmpl));
  await answer(page,false);
  expect(await state(page,()=>st.review.map(reviewKey))).toContain(key);
  // The miss leaves the question open, so finish it, then step away. The
  // session clock jumps to the Rematch's due time so leaving deals that one.
  await answer(page,true);
  await state(page,k=>{
    const r=st.review.find(x=>reviewKey(x)===k);
    st.served=r.due-1;
  },key);
  await page.click('#gym-forfeit');
  await page.click('#gym-back');
  expect(await state(page,()=>[!!st.q.rematch,reviewKey(st.q.tmpl)])).toEqual([true,key]);
});

test('answering inside a Gym still grows a streak',async({page})=>{
  await pinXp(page);
  await offerGym(page,'science',1);
  await page.click('[data-gym-start="science"]');
  await expect(page.locator('.gym-name')).toHaveText('Psyduck');
  await answer(page,true);
  expect(await state(page,()=>st.streak)).toBe(1);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>xpForStreak(1)));
  expect(await state(page,()=>st.gym.lead)).toBe(await state(page,()=>GYM_LEAD_HP-1));
});

test('an old save at a higher tier keeps that tier and its badges',async({page})=>{
  const save={v:1,starter:0,activeIdx:0,team:[{num:'#001',level:7,xp:3}],dex:['#001'],
    stats:{math:{cor:5,att:6,level:3,cs:1,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}}};
  const p2=await page.context().newPage();
  const err=await openGame(p2,{save});
  expect(await state(p2,()=>({level:st.stats.math.level,badges:[...st.badges.math].sort(),phase:st.phase,offer:st.gymOffer.math}))).toEqual({
    level:3,badges:[1,2],phase:'play',offer:null,
  });
  expect(err).toEqual([]);
});

test('a battle in progress reloads onto the next question with the same hearts',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  const queue=await state(page,()=>st.gym.queue.slice());
  await answer(page,true);
  expect(await state(page,()=>st.gym.lead)).toBe(await state(page,()=>GYM_LEAD_HP-1));
  await page.reload();
  expect(await state(page,()=>({phase:st.phase,qi:st.gym.qi,lead:st.gym.lead,kid:st.gym.kid,idx:st.q.tmpl.idx,draft:st.draft}))).toEqual({
    phase:'gym',qi:1,lead:await state(page,()=>GYM_LEAD_HP-1),kid:await state(page,()=>GYM_KID_HP),idx:queue[1],draft:'',
  });
});

test('a Rare Candy levels the active Pokémon, and a Great Ball starts the next catch ahead',async({page})=>{
  await pinXp(page);
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await page.click('#award-go');
  const lvl=await state(page,()=>activeTM().level);
  await page.click('#candy-btn');
  expect(await state(page,()=>({candy:st.items.candy,level:activeTM().level}))).toEqual({candy:0,level:lvl+1});

  await state(page,()=>{st.items.great=1;triggerWildEncounter(false);});
  expect(await state(page,()=>({cs:st.wild.correctStreak,great:st.items.great,phase:st.phase}))).toEqual({cs:1,great:0,phase:'wild'});
  await expect(page.locator('.great-note')).toContainText('Great Ball');
  await expect(page.locator('.catch-pip.filled')).toHaveCount(1);
});

test('dropping a tier gives back the badge for that tier',async({page})=>{
  await state(page,()=>{
    st.stats.math.level=2;
    st.stats.math.ws=LEVEL_DOWN_STREAK-1;
    st.badges.math=[1];
    st.gymOffer.math={tier:2,cool:0};
  });
  await serveMathMiss(page);
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math],offer:st.gymOffer.math}))).toEqual({
    level:1,badges:[],offer:null,
  });
});

function serveMathMiss(page){
  return state(page,()=>{
    st.q=serveQuestion('math',1,0,questionPname());
    st.cor=false;st.tries=0;st.wrong=[];st.helped=false;st.armAt=0;st.phase='play';
    handleAnswer(st.q.answers.findIndex((_,i)=>i!==st.q.correctIndex));
  });
}
