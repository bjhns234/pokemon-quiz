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
  await expect(page.locator('.gym-confirm')).toContainText('End this Gym battle');
  await page.click('#gym-forfeit-no');
  expect(await state(page,()=>st.gym&&st.gym.over)).toBe(null);
  await expect(page.locator('#gym-forfeit')).toContainText('End the battle');
  await page.click('#gym-forfeit');
  await page.click('#gym-forfeit-yes');
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
    st.stats.math.cs=2;
  });
  await page.click('#help-btn');
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  await expect(page.locator('.help-box')).toContainText(hint);
  await answer(page,true);
  expect(await state(page,()=>({lead:st.gym.lead,kid:st.gym.kid,streak:st.streak,cs:st.stats.math.cs}))).toEqual(await state(page,()=>({lead:GYM_LEAD_HP,kid:GYM_KID_HP,streak:4,cs:2})));
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

  await state(page,()=>{st.armAt=0;st.gym.timerLeft=0;st.gym.deadline=Date.now()-5;});
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
  for(const d of '1081')await page.click(`[data-gate-digit="${d}"]`);
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
  await page.click('#gym-forfeit-yes');
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
  expect(await state(page,()=>({cs:st.wild.correctStreak,great:st.items.great,phase:st.phase,held:!!st.wild.greatHeld}))).toEqual({cs:1,great:1,phase:'wild',held:true});
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

test('three gym misses do not drop the tier or its badge',async({page})=>{
  await state(page,()=>{
    st.stats.math.level=2;
    st.stats.math.ws=0;
    st.stats.math.cs=0;
    st.badges.math=[1];
    st.gymOffer.math={tier:2,cool:0};
    st.cor=true;
    render();
  });
  await page.click('[data-gym-start="math"]');
  for(let i=0;i<3;i++){
    await answer(page,false);
    await answer(page,true);
    await page.click('#nxt');
  }
  const hp=await state(page,()=>({kid:GYM_KID_HP,lead:GYM_LEAD_HP}));
  expect(await state(page,()=>({
    phase:st.phase,level:st.stats.math.level,badges:[...st.badges.math],
    ws:st.stats.math.ws,cs:st.stats.math.cs,kid:st.gym.kid,lead:st.gym.lead,tier:st.gym.tier,offer:st.gymOffer.math,
  }))).toEqual({phase:'gym',level:2,badges:[1],ws:0,cs:0,kid:hp.kid-3,lead:hp.lead,tier:2,offer:null});
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math].sort(),phase:st.phase}))).toEqual({
    level:3,badges:[1,2],phase:'award',
  });
  await expect(page.locator('[data-badge="math-2"]')).toContainText('Charge Badge');
  await page.reload();
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math].sort()}))).toEqual({level:3,badges:[1,2]});
});

test('a gym miss does not finish a practice losing streak',async({page})=>{
  await state(page,()=>{
    st.stats.math.level=2;
    st.stats.math.ws=LEVEL_DOWN_STREAK-1;
    st.badges.math=[1];
    st.gymOffer.math={tier:2,cool:0};
    st.cor=true;
    render();
  });
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.kid=1;});
  await answer(page,false);
  expect(await state(page,()=>({
    level:st.stats.math.level,badges:[...st.badges.math],ws:st.stats.math.ws,
    tier:st.gymOffer.math&&st.gymOffer.math.tier,cool:st.gymOffer.math&&st.gymOffer.math.cool,
  }))).toEqual(await state(page,()=>({level:2,badges:[1],ws:LEVEL_DOWN_STREAK-1,tier:2,cool:GYM_COOLDOWN})));
});

test('reloading after help does not let that answer hit the leader',async({page})=>{
  await pinXp(page);
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.stats.math.cs=2;});
  await page.click('#help-btn');
  const before=await state(page,()=>activeTM().xp);
  await page.reload();
  expect(await state(page,()=>({helped:st.helped,tries:st.tries,lead:st.gym.lead}))).toEqual(await state(page,()=>({helped:true,tries:0,lead:GYM_LEAD_HP})));
  await answer(page,true);
  expect(await state(page,()=>activeTM().xp)).toBe(before+await state(page,()=>XP_WITH_HELP));
  expect(await state(page,()=>({lead:st.gym.lead,cs:st.stats.math.cs}))).toEqual(await state(page,()=>({lead:GYM_LEAD_HP,cs:2})));
});

test('reloading after a miss keeps the lost heart and does not also hit the leader',async({page})=>{
  await offerGym(page,'math',2);
  await state(page,()=>{st.stats.math.ws=0;st.stats.math.cs=1;st.badges.math=[1];});
  await page.click('[data-gym-start="math"]');
  await answer(page,false);
  const wrong=await state(page,()=>st.wrong.slice());
  expect(wrong.length).toBe(1);
  await page.reload();
  const mid=await state(page,()=>({
    tries:st.tries,kid:st.gym.kid,lead:st.gym.lead,ws:st.stats.math.ws,cs:st.stats.math.cs,
    wrong:st.wrong.slice(),level:st.stats.math.level,badges:[...st.badges.math],
  }));
  expect(mid.tries).toBe(1);
  expect(mid.kid).toBe(await state(page,()=>GYM_KID_HP-1));
  expect(mid.lead).toBe(await state(page,()=>GYM_LEAD_HP));
  expect(mid.ws).toBe(0);
  expect(mid.cs).toBe(1);
  expect(mid.wrong).toEqual(wrong);
  expect(mid.level).toBe(2);
  expect(mid.badges).toEqual([1]);
  await answer(page,true);
  expect(await state(page,()=>({lead:st.gym.lead,kid:st.gym.kid,ws:st.stats.math.ws,cs:st.stats.math.cs}))).toEqual(await state(page,()=>({
    lead:GYM_LEAD_HP,kid:GYM_KID_HP-1,ws:0,cs:1,
  })));
});

test('reloading mid-question keeps the thinking time that is left',async({page})=>{
  await offerGym(page,'math',3);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    st.armAt=Date.now();
    st.gym.timerLeft=1800;
    st.gym.deadline=Date.now()+1800;
    st.tries=0;st.helped=false;st.cor=false;
    save();
  });
  await page.reload();
  const left=await state(page,()=>st.gym.timerLeft);
  expect(left).toBeGreaterThan(200);
  expect(left).toBeLessThan(8000);
  expect(await state(page,()=>st.tries)).toBe(0);
  await expect(page.locator('#gym-time')).toBeVisible();
});

test('hiding the page pauses thinking time',async({page})=>{
  await offerGym(page,'math',3);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    st.armAt=0;
    st.gym.timerLeft=700;
    st.gym.deadline=Date.now()+700;
  });
  await page.evaluate(()=>{
    window.__vis='hidden';
    Object.defineProperty(document,'visibilityState',{configurable:true,get(){return window.__vis;}});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1000);
  expect(await state(page,()=>st.tries)).toBe(0);
  expect(await state(page,()=>st.gym.kid)).toBe(await state(page,()=>GYM_KID_HP));
  expect(await state(page,()=>st.gym.timerLeft)).toBeGreaterThan(200);
  await page.evaluate(()=>{
    window.__vis='visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(()=>state(page,()=>st.tries),{timeout:4000}).toBeGreaterThan(0);
  expect(await state(page,()=>st.gym.kid)).toBe(await state(page,()=>GYM_KID_HP-1));
});

test('opening the Pokédex pauses thinking time',async({page})=>{
  await offerGym(page,'math',3);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    st.armAt=0;
    st.gym.timerLeft=20000;
    st.gym.deadline=Date.now()+20000;
  });
  const before=await state(page,()=>st.gym.timerLeft);
  await page.click('#nav-pdx');
  await page.waitForTimeout(800);
  const frozen=await state(page,()=>st.gym.timerLeft);
  expect(await state(page,()=>st.tries)).toBe(0);
  expect(await state(page,()=>st.gym.kid)).toBe(await state(page,()=>GYM_KID_HP));
  expect(frozen).toBeGreaterThan(before-500);
  await state(page,()=>{st.gym.deadline=Date.now()-30000;});
  await page.waitForTimeout(400);
  expect(await state(page,()=>st.tries)).toBe(0);
  await state(page,()=>{st.gym.deadline=null;st.gym.timerLeft=400;});
  await page.click('#nav-game');
  await expect.poll(()=>state(page,()=>st.tries),{timeout:4000}).toBeGreaterThan(0);
});

test('a timeout is a miss, and Check afterwards does not hit the leader',async({page})=>{
  await offerGym(page,'math',3);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{
    let idx=-1;
    for(let i=0;i<QB.math[3].length;i++){
      if(isTypedQuestion(serveQuestion('math',3,i,questionPname()))){idx=i;break;}
    }
    st.gym.queue[st.gym.qi]=idx;
    dealGymQuestion();
    st.armAt=0;
    typeDigit('4',1);
  });
  expect(await state(page,()=>st.draft)).toBe('4');
  expect(await state(page,()=>st.tries)).toBe(0);
  expect(await state(page,()=>gymTimerApplies())).toBe(true);
  await state(page,()=>{st.gym.timerLeft=0;st.gym.deadline=Date.now()-5;});
  await expect.poll(()=>state(page,()=>st.tries)).toBeGreaterThan(0);
  expect(await state(page,()=>({kid:st.gym.kid,lead:st.gym.lead,draft:st.draft}))).toEqual(await state(page,()=>({kid:GYM_KID_HP-1,lead:GYM_LEAD_HP,draft:'4'})));
  await state(page,()=>{st.armAt=0;submitTyped(st.q.answers[st.q.correctIndex]);});
  expect(await state(page,()=>({tries:st.tries,lead:st.gym.lead,kid:st.gym.kid}))).toEqual(await state(page,()=>({tries:2,lead:GYM_LEAD_HP,kid:GYM_KID_HP-1})));
});

test('a Great Ball waits until the encounter ends',async({page})=>{
  await state(page,()=>{st.items.great=1;st.cor=true;triggerWildEncounter(false);});
  await answer(page,true);
  expect(await state(page,()=>st.items.great)).toBe(1);
  await page.reload();
  expect(await state(page,()=>({great:st.items.great,phase:st.phase,wild:st.wild}))).toEqual({great:1,phase:'play',wild:null});

  await state(page,()=>{st.items.great=1;st.cor=true;triggerWildEncounter(false);});
  await page.click('#flee');
  expect(await state(page,()=>st.items.great)).toBe(0);
  await page.reload();
  expect(await state(page,()=>st.items.great)).toBe(0);

  await state(page,()=>{st.items.great=1;st.cor=true;triggerWildEncounter(false);});
  await answer(page,false);
  await answer(page,true);
  await page.click('#nxt');
  await answer(page,false);
  expect(await state(page,()=>st.wildEscape)).toBe(true);
  expect(await state(page,()=>st.items.great)).toBe(1);
  await page.click('#nxt');
  expect(await state(page,()=>st.items.great)).toBe(0);

  await state(page,()=>{
    st.items.great=1;st.cor=true;triggerWildEncounter(false);
    st.wild.correctStreak=CATCH_STREAK_NEEDED;
    st.cor=true;
    render();
  });
  expect(await state(page,()=>st.items.great)).toBe(1);
  await page.click('#nxt');
  await expect.poll(()=>state(page,()=>st.items.great),{timeout:12000}).toBe(0);
});

test('Not now stays dismissed across a reload',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-later="math"]');
  await page.reload();
  await answer(page,true);
  await expect(page.locator('[data-gym-start="math"]')).toHaveCount(0);
  expect(await state(page,()=>st.gymSnooze.math)).toBe(true);
  await nextQuestion(page);
  await answer(page,true);
  await expect(page.locator('[data-gym-start="math"]')).toBeVisible();
});

test('three wrong grown-up answers lock the gate, and a reload keeps it',async({page})=>{
  await page.click('#nav-pdx');
  await page.click('#grownups-btn');
  for(let i=0;i<2;i++){
    await page.click('[data-gate-digit="1"]');
    await page.click('[data-gate="ok"]');
    await expect(page.locator('.gate-note')).toContainText('grown-up');
  }
  expect(await state(page,()=>st.gateMisses)).toBe(2);
  await page.reload();
  await page.click('#nav-pdx');
  await page.click('#grownups-btn');
  expect(await state(page,()=>st.gateMisses)).toBe(2);
  await page.click('[data-gate-digit="1"]');
  await page.click('[data-gate="ok"]');
  await expect(page.locator('.gate-pad')).toHaveCount(0);
  await expect(page.locator('.gate-note')).toContainText('little while');
  await page.reload();
  await page.click('#nav-pdx');
  await page.click('#grownups-btn');
  await expect(page.locator('.gate-pad')).toHaveCount(0);
  await state(page,()=>{st.gateLock=Date.now()-1000;renderPokedex();});
  await expect(page.locator('.gate-pad')).toBeVisible();
  await expect(page.locator('.gate-q')).toContainText('47');
  await expect(page.locator('.gate-q')).toContainText('23');
});

test('a reading Gym on the harder tier is timed and awards the Legend Badge',async({page})=>{
  expect(await state(page,()=>maxLevel('reading'))).toBe(4);
  await offerGym(page,'reading',3);
  await page.click('[data-gym-start="reading"]');
  await expect(page.locator('#gym-time')).toBeVisible();
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await expect(page.locator('[data-badge="reading-3"]')).toContainText('Legend Badge');
  expect(await state(page,()=>st.stats.reading.level)).toBe(4);
});

test('a grade 1 science Gym has no timer',async({page})=>{
  expect(await state(page,()=>maxLevel('science'))).toBe(3);
  await offerGym(page,'science',2);
  await page.click('[data-gym-start="science"]');
  await expect(page.locator('.gym-name')).toHaveText('Psyduck');
  await expect(page.locator('#gym-time')).toHaveCount(0);
});

test('a lost heart stays visible against the card',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await answer(page,false);
  const empty=page.locator('.you-row .heart:not(.on)').first();
  const on=page.locator('.you-row .heart.on').first();
  const cEmpty=await empty.evaluate(el=>getComputedStyle(el).color);
  const cOn=await on.evaluate(el=>getComputedStyle(el).color);
  expect(cEmpty).not.toBe('rgb(229, 231, 235)');
  expect(cEmpty).not.toBe(cOn);
});

test('winning a tier again does not pay the prize a second time',async({page})=>{
  await pinXp(page);
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await page.click('#award-go');
  const first=await state(page,()=>({candy:st.items.candy,great:st.items.great,team:st.team.length,prizes:[...st.prizes.math]}));
  expect(first.prizes).toEqual([1]);
  await state(page,()=>{
    st.stats.math.level=2;
    st.stats.math.ws=LEVEL_DOWN_STREAK-1;
    st.badges.math=[1];
  });
  await serveMathMiss(page);
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math],prizes:[...st.prizes.math]}))).toEqual({
    level:1,badges:[],prizes:[1],
  });
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  const before=await state(page,()=>activeTM().xp);
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  const after=await state(page,()=>({
    candy:st.items.candy,great:st.items.great,xp:activeTM().xp,team:st.team.length,
    level:st.stats.math.level,badges:[...st.badges.math],
  }));
  expect(after.candy).toBe(first.candy);
  expect(after.great).toBe(first.great);
  expect(after.team).toBe(first.team);
  expect(after.xp).toBe(before+await state(page,()=>xpForStreak(1)));
  expect(after.level).toBe(2);
  expect(after.badges).toEqual([1]);
  await expect(page.locator('.award-card')).toContainText('already got the prize');
  await expect(page.locator('.award-card')).not.toContainText('Rare Candy');
  await page.reload();
  await expect(page.locator('.award-card')).toContainText('already got the prize');
  expect(await state(page,()=>st.items.candy)).toBe(first.candy);
});

test('clean hits inside a Gym do not arm another battle',async({page})=>{
  await offerGym(page,'math',1);
  await page.click('[data-gym-start="math"]');
  for(let i=0;i<3;i++){
    await answer(page,true);
    expect(await state(page,()=>st.gymOffer.math)).toBe(null);
    expect(await state(page,()=>st.stats.math.cs)).toBe(0);
    expect(await state(page,()=>st.stats.math.level)).toBe(1);
    if(i<2)await page.click('#nxt');
  }
  expect(await state(page,()=>st.gym.lead)).toBe(await state(page,()=>GYM_LEAD_HP-3));
});

test('a Rare Candy on a nearly full bar levels exactly once',async({page})=>{
  await state(page,()=>{
    const tm=activeTM();
    tm.level=60;
    tm.xp=xpToNext(60)-1;
    st.items.candy=1;
    st.phase='play';
    render();
  });
  await page.click('#candy-btn');
  const after=await state(page,()=>({level:activeTM().level,xp:activeTM().xp,candy:st.items.candy,next:xpToNext(activeTM().level)}));
  expect(after.level).toBe(61);
  expect(after.xp).toBeGreaterThanOrEqual(0);
  expect(after.xp).toBeLessThan(after.next);
  expect(after.candy).toBe(0);

  await state(page,()=>{
    const tm=activeTM();
    tm.pi=0;
    tm.level=15;
    tm.xp=xpToNext(15)-1;
    st.items.candy=1;
    st.pendingEvo=null;
    st.phase='play';
    render();
  });
  await page.click('#candy-btn');
  expect(await state(page,()=>({level:activeTM().level,candy:st.items.candy,evo:!!st.pendingEvo,pi:activeTM().pi}))).toEqual({
    level:16,candy:0,evo:true,pi:0,
  });
});

function serveMathMiss(page){
  return state(page,()=>{
    st.q=serveQuestion('math',1,0,questionPname());
    st.cor=false;st.tries=0;st.wrong=[];st.helped=false;st.armAt=0;st.phase='play';
    handleAnswer(st.q.answers.findIndex((_,i)=>i!==st.q.correctIndex));
  });
}
