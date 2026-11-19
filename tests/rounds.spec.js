// A round is a fixed number of answered questions, then a done screen.
// A check is a first try with no help. A miss that is later corrected, or a
// correct answer after help, counts once and is an empty circle. There is no
// red X on the done screen, and nothing asks him to come back later.
const {test,expect}=require('@playwright/test');
const fs=require('fs');
const {openGame,startGame,state,answer}=require('./helpers');

const ART='/opt/cursor/artifacts';
const BANNED=/tomorrow|come back|daily|countdown|see you|don'?t go|do not go|one more|reward/i;

async function boot(page){
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    activeKid().name='Simon';
    const tm=activeTM();
    tm.level=60;tm.xp=-8000;st.pendingEvo=null;
    // Keeps a normal Next from rolling a wild Pokémon, so the round count
    // is the questions the test asked for.
    Math.random=()=>0.99;
    save();
  });
  return errors;
}

// One miss is allowed. A second question's first miss is what sends it off.
// Landing the first question afterwards is not another ball.
async function bonusRunsOff(page){
  await answer(page,false);
  await answer(page,true);
  await page.click('#nxt');
  await answer(page,false);
}

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  expect(m,'parent check should be a multiplication').not.toBeNull();
  for(const d of String(Number(m[1])*Number(m[2])))await page.locator(`[data-parent-digit="${d}"]`).click();
  await page.click('#parent-go');
  await expect(page.locator('#grade-setting')).toBeVisible();
}

async function openParents(page){
  if(await page.locator('#round-setting').isVisible()&&await page.locator('#grade-setting').isVisible())return;
  if(!(await page.locator('#parents-link').isVisible())){
    if(await page.locator('#nav-pdx').isVisible())await page.click('#nav-pdx');
  }
  await page.click('#parents-link');
  await passParentGate(page);
}

async function backToGame(page){
  await page.click('#parent-back');
  if(await page.locator('#nav-game').isVisible())await page.click('#nav-game');
  await expect(page.locator('.qtext, #round-done').first()).toBeVisible();
}

// `rights` of the answers are clean first tries. The rest ask for help and
// then land it: one question, not a check, and not a warm-up.
async function releaseRound(page){
  await state(page,()=>{st.armAt=0;});
}

async function playAnswers(page,total,rights){
  for(let i=0;i<total;i++){
    if(i<rights){
      await answer(page,true);
    }else{
      const before=await state(page,()=>st.round?st.round.n:0);
      await state(page,()=>askForHelp());
      expect(await state(page,()=>st.round?st.round.n:0),'help is not an answer').toBe(before);
      await answer(page,true);
    }
    if(i<total-1)await page.click('#nxt');
  }
}

function kidData(extra){
  return Object.assign({
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
    items:{candy:2,great:1},
    settings:{grade:'auto'},
  },extra);
}

test('the 10th final answer ends the round, and a retry counts once',async({page})=>{
  const errors=await boot(page);
  const before=await state(page,()=>st.round?st.round.n:0);
  await answer(page,false);
  expect(await state(page,()=>st.round?st.round.n:0),'a miss is not final').toBe(before);
  await answer(page,true);
  expect(await state(page,()=>st.round&&st.round.n)).toBe(1);
  expect(await state(page,()=>st.round.right),'a corrected miss is not a check').toBe(0);
  await page.click('#nxt');

  // Nine clean answers after the one corrected miss: 10 final answers, 9 right.
  await playAnswers(page,9,9);
  await expect(page.locator('#round-done')).toHaveCount(0);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>({n:st.round.n,right:st.round.right,bonus:!!st.bonusWild,phase:st.phase}))).toEqual({
    n:10,right:9,bonus:true,phase:'wild',
  });
  expect(errors).toEqual([]);
});

test('six of ten has no encounter and seven of ten starts one that does not count',async({page})=>{
  test.setTimeout(90000);
  const errors=await boot(page);
  await playAnswers(page,10,6);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('.wild-card')).toHaveCount(0);
  await expect(page.locator('#round-bonus')).toHaveCount(0);
  await expect(page.locator('#round-line')).toHaveText('6 of 10 right. You and Bulbasaur kept going!');
  await expect(page.locator('#round-done')).not.toContainText('✗');
  expect(await page.locator('.round-mark[data-right="1"]').count()).toBe(6);
  expect(await page.locator('.round-mark[data-right="0"]').count()).toBe(4);
  const want=await state(page,()=>{
    let xp=0;
    for(let s=1;s<=6;s++)xp+=xpForStreak(s)+milestoneBonus(s);
    xp+=4*XP_WITH_HELP;
    return xp;
  });
  expect(await state(page,()=>st.round.xp)).toBe(want);
  await expect(page.locator('#round-xp')).toContainText(String(want));
  await expect(page.locator('#round-xp')).toContainText('XP');

  await releaseRound(page);
  await page.click('#round-again');
  // Round 2 is a trainer battle. This check is about the bonus catch,
  // so the finish counts as round 3.
  await state(page,()=>{st.roundsDone=2;if(st.route){st.route.step=2;st.route.announce=null;st.route.debut=false;}});
  await playAnswers(page,10,7);
  await expect(page.locator('#round-done')).toHaveCount(0);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  const caughtAt=await state(page,()=>st.round.n);
  expect(caughtAt).toBe(10);
  await state(page,()=>{
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild.pi=pi;st.wild.shiny=false;st.wild.correctStreak=0;st.wild.misses=0;
    refillQuestion();render();
  });
  await answer(page,true);
  expect(await state(page,()=>st.round.n),'a bonus question is not the next round').toBe(10);
  await page.click('#nxt');
  await answer(page,true);
  await page.click('#nxt');
  await answer(page,true);
  await expect(page.locator('#nxt')).toContainText('Catch');
  await page.click('#nxt');
  await expect(page.locator('#round-done')).toBeVisible({timeout:20000});
  await expect(page.locator('#round-bonus')).toHaveText('Pidgey joined your team!');
  expect(await state(page,()=>st.round.n)).toBe(10);
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(true);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data);
  expect(saved.team.some(t=>t.num==='#016')).toBe(true);
  expect(saved.v).toBe(1);

  await releaseRound(page);
  await page.click('#round-again');
  expect(await state(page,()=>st.round.n)).toBe(0);
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(1);
  expect(errors).toEqual([]);
});

test('a bonus the Pokémon leaves still shows the round, with no red cross',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,10,7);
  await state(page,()=>{
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild.pi=pi;st.wild.shiny=false;
    refillQuestion();render();
  });
  await answer(page,false);
  expect(await state(page,()=>st.phase)).toBe('wild');
  expect(await state(page,()=>st.round.n)).toBe(10);
  await answer(page,true);
  await page.click('#nxt');
  await answer(page,false);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('#round-bonus')).toHaveText('Pidgey got away this time. Great work!');
  await expect(page.locator('#round-done')).not.toContainText('✗');
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(false);
  expect(errors).toEqual([]);
});

async function forceWild(page,name,streak){
  await state(page,({name,streak})=>{
    const pi=PKM.findIndex(p=>p.n===name);
    st.wild={pi,level:6,shiny:false,correctStreak:streak|0,misses:0};
    st.phase='wild';
    st.bonusWild=false;
    loadQuestion();
  },{name,streak});
}

test('a catch that fills the round keeps the Pokémon',async({page})=>{
  test.setTimeout(60000);
  const errors=await boot(page);
  await state(page,()=>{
    st.round={n:9,right:9,len:10,marks:Array(9).fill(1),xp:0,bonus:null,endAfter:false,closed:false,holdEvo:false};
    st.streak=0;
  });
  await forceWild(page,'Pidgey',0);
  await answer(page,true);
  expect(await state(page,()=>({
    phase:st.phase,
    name:st.wild&&PKM[st.wild.pi].n,
    cs:st.wild&&st.wild.correctStreak,
    n:st.round.n,
    caught:st.team.some(t=>PKM[t.pi].n==='Pidgey'),
  }))).toEqual({phase:'wild',name:'Pidgey',cs:1,n:10,caught:false});
  await page.click('#nxt');
  await answer(page,true);
  expect(await state(page,()=>({n:st.round.n,name:st.wild&&PKM[st.wild.pi].n,cs:st.wild&&st.wild.correctStreak}))).toEqual({
    n:10,name:'Pidgey',cs:2,
  });
  await page.click('#nxt');
  await answer(page,true);
  await expect(page.locator('#nxt')).toContainText('Catch');
  await page.click('#nxt');
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(true);
  expect(await state(page,()=>st.round.n)).toBe(10);
  expect(errors).toEqual([]);
});

test('a catch below the line still keeps the Pokémon and shows round done',async({page})=>{
  test.setTimeout(60000);
  const errors=await boot(page);
  await state(page,()=>{
    st.round={n:9,right:5,len:10,marks:[1,1,1,1,1,0,0,0,0],xp:0,bonus:null,endAfter:false,closed:false,holdEvo:false};
    st.streak=0;
  });
  await forceWild(page,'Pidgey',2);
  await answer(page,true);
  expect(await state(page,()=>st.wild&&PKM[st.wild.pi].n)).toBe('Pidgey');
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(false);
  await expect(page.locator('#nxt')).toContainText('Catch');
  await page.click('#nxt');
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(true);
  await expect(page.locator('#round-done')).toBeVisible({timeout:20000});
  await expect(page.locator('.wild-card')).toHaveCount(0);
  expect(await state(page,()=>st.round.n)).toBe(10);
  expect(errors).toEqual([]);
});

test('an evolution from the filling catch runs before the finale and the Pokémon stays',async({page})=>{
  test.setTimeout(60000);
  const errors=await boot(page);
  await state(page,()=>{
    const tm=activeTM();
    tm.pi=0;
    tm.level=15;
    tm.xp=xpToNext(15)-10;
    st.streak=4;
    st.pendingEvo=null;
    st.round={n:9,right:9,len:10,marks:Array(9).fill(1),xp:0,bonus:null,endAfter:false,closed:false,holdEvo:false};
  });
  await forceWild(page,'Pidgey',2);
  await answer(page,true);
  expect(await state(page,()=>st.wild&&PKM[st.wild.pi].n)).toBe('Pidgey');
  expect(await state(page,()=>!!st.pendingEvo)).toBe(true);
  await expect(page.locator('#nxt')).toContainText('Catch');
  await page.click('#nxt');
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(true);
  await expect.poll(()=>state(page,()=>PKM[activeTM().pi].n),{timeout:25000}).toBe('Ivysaur');
  await expect.poll(()=>state(page,()=>st.bonusWild||st.phase==='round'),{timeout:25000}).toBe(true);
  expect(await state(page,()=>st.round.n)).toBe(10);
  expect(errors).toEqual([]);
});

test('tapping 10 after 5 lets this round run to 10',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,6,6);
  await page.click('#nxt');
  expect(await state(page,()=>st.round.n)).toBe(6);
  await openParents(page);
  await page.locator('#round-setting [data-round="5"]').click();
  await page.locator('#round-setting [data-round="10"]').click();
  await backToGame(page);
  await answer(page,true);
  await page.click('#nxt');
  expect(await state(page,()=>({n:st.round.n,len:st.round.len,end:!!st.round.endAfter,phase:st.phase}))).toEqual({
    n:7,len:10,end:false,phase:'play',
  });
  const other=await state(page,()=>{
    profiles.kids.push({
      id:'leo',name:'Leo',avatar:'#004',
      data:{
        v:1,
        settings:{grade:'auto',round:10},
        round:{n:6,right:6,len:10,marks:[],xp:0,endAfter:false,closed:false},
        team:[{num:'#004',level:5,xp:0}],
      },
    });
    setKidRound('leo','5');
    setKidRound('leo','10');
    const round=profiles.kids.find(k=>k.id==='leo').data.round;
    return {endAfter:!!round.endAfter,len:round.len,pref:profiles.kids.find(k=>k.id==='leo').data.settings.round};
  });
  expect(other).toEqual({endAfter:false,len:10,pref:10});
  expect(errors).toEqual([]);
});

test('a round length saved before the first Pokémon is kept',async({page})=>{
  const maya={id:'maya',name:'Maya',avatar:'#004',data:null,settings:{grade:1,round:15}};
  const simon={id:'simon',name:'Simon',avatar:'#001',data:{
    v:1,starter:0,activeIdx:0,
    team:[{num:'#001',level:8,xp:0}],
    dex:['#001'],subject:'math',
    stats:{math:{cor:0,att:0,level:1,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
    settings:{grade:'auto',round:10},
  }};
  const errors=await openGame(page,{save:{v:1,roster:1,activeId:null,kids:[simon,maya]}});
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await state(page,()=>({len:st.round.len,pref:st.roundPref,grade:st.grade}))).toEqual({len:15,pref:15,grade:1});
  const stored=await page.evaluate(()=>{
    const kid=JSON.parse(localStorage.getItem('pkq-save')).kids.find(k=>k.name==='Maya');
    return {round:kid.settings&&kid.settings.round,v:JSON.parse(localStorage.getItem('pkq-save')).v};
  });
  expect(stored).toEqual({round:15,v:1});
  expect(errors).toEqual([]);
});

test('reloading during the bonus encounter starts it again without counting',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.streak=0;st.review=[];});
  await playAnswers(page,10,8);
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  expect(await state(page,()=>st.round.n)).toBe(10);
  await page.reload();
  expect(await state(page,()=>({phase:st.phase,bonus:!!st.bonusWild,n:st.round.n}))).toEqual({
    phase:'wild',bonus:true,n:10,
  });
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(10);
  expect(errors).toEqual([]);
});

test('Back to it hides the round dots on a phone',async({page})=>{
  const errors=await boot(page);
  await page.setViewportSize({width:390,height:844});
  await state(page,()=>{st.q.back=true;render();});
  await expect(page.locator('.warmup-back')).toBeVisible();
  const shown=await page.locator('#game .q-head').evaluate(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>1);
  expect(shown).toBe(false);
  fs.mkdirSync(ART,{recursive:true});
  await page.screenshot({path:ART+'/question_dots_390x844.png'});
  expect(errors).toEqual([]);
});

test('a reflex tap does not start the next round',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,10,6);
  await expect(page.locator('#round-done')).toBeVisible();
  await page.click('#round-again');
  expect(await state(page,()=>st.phase)).toBe('round');
  await page.click('#round-done-exit');
  await expect(page.locator('#who-screen')).toHaveCount(0);
  await state(page,()=>{st.armAt=0;});
  await page.click('#round-again');
  expect(await state(page,()=>st.phase)).toBe('play');
  expect(await state(page,()=>st.round.n)).toBe(0);
  expect(errors).toEqual([]);
});

test('a milestone on a wild question is counted in the round XP',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.streak=4;
    st.round=freshRound(10);
    st.review=[];
  });
  await forceWild(page,'Pidgey',0);
  const before=await state(page,()=>st.round.xp);
  await answer(page,true);
  const bonus=await state(page,()=>milestoneBonus(5));
  expect(bonus).toBeGreaterThan(0);
  expect(await state(page,()=>st.round.xp)).toBe(before+bonus);
  expect(errors).toEqual([]);
});

test('a flee that fills a qualified round still starts the bonus',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=8;
    st.round.marks=[1,1,1,1,1,1,1,1,0];
    st.streak=0;
  });
  await forceWild(page,'Pidgey',0);
  await state(page,()=>{st.wild.misses=1;});
  await answer(page,false);
  await expect(page.locator('.wild-card')).toBeVisible();
  await expect(page.locator('#round-done')).toHaveCount(0);
  expect(await state(page,()=>({
    n:st.round.n,
    right:st.round.right,
    bonus:!!st.bonusWild,
    phase:st.phase,
  }))).toEqual({n:10,right:8,bonus:true,phase:'wild'});
  expect(errors).toEqual([]);
});

test('reloading during a held catch still starts the bonus',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.round=freshRound(10);
    st.round.n=9;
    st.round.right=9;
    st.round.marks=Array(9).fill(1);
    st.streak=0;
  });
  await forceWild(page,'Pidgey',2);
  await answer(page,true);
  expect(await state(page,()=>!!(st.round&&st.round.holdWild))).toBe(true);
  expect(await state(page,()=>st.team.some(t=>PKM[t.pi].n==='Pidgey'))).toBe(false);
  await page.reload();
  await expect(page.locator('.wild-card')).toBeVisible();
  await expect(page.locator('#round-done')).toHaveCount(0);
  expect(await state(page,()=>({
    n:st.round.n,
    bonus:!!st.bonusWild,
    phase:st.phase,
    caught:st.team.some(t=>PKM[t.pi].n==='Pidgey'),
  }))).toEqual({n:10,bonus:true,phase:'wild',caught:false});
  expect(errors).toEqual([]);
});

test('an exhausted wild pool still finishes the round',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    const bases=WILD_BY_GEN.reduce((a,g)=>a.concat(g),[]);
    bases.forEach(pi=>{
      st.team.push({pi,level:5,xp:0,shiny:false});
      st.team.push({pi,level:5,xp:0,shiny:true});
    });
    st.round=freshRound(10);
    st.round.n=10;
    st.round.right=8;
    st.round.closed=true;
    st.round.bonusPending=true;
    st.round.bonus=null;
    st.bonusWild=false;
    st.phase='play';
    st.q=null;
    bootInto();
  });
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('.wild-card')).toHaveCount(0);
  expect(await state(page,()=>({phase:st.phase,bonus:!!st.bonusWild,pending:!!(st.round&&st.round.bonusPending)}))).toEqual({
    phase:'round',bonus:false,pending:false,
  });
  expect(errors).toEqual([]);
});

test('round checks are about 22px on a tablet and the card still fits',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.phase='round';
    st.round={n:10,right:8,len:10,marks:[1,1,1,1,1,1,1,1,0,0],xp:40,bonus:null,closed:true,endAfter:false,holdEvo:false};
    render();
  });
  for(const size of [{width:768,height:1024},{width:1024,height:768},{width:390,height:844}]){
    await page.setViewportSize(size);
    const where=`${size.width}x${size.height}`;
    const fit=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      const mark=document.querySelector('.round-mark');
      return {scroll:main.scrollHeight-main.clientHeight,mark:parseFloat(getComputedStyle(mark).fontSize)};
    });
    expect(fit.scroll,where).toBeLessThanOrEqual(1);
    if(size.width>=768){
      expect(fit.mark,where).toBeGreaterThanOrEqual(20);
      expect(fit.mark,where).toBeLessThanOrEqual(22);
    }else{
      expect(fit.mark,where).toBeGreaterThanOrEqual(14);
    }
  }
  expect(errors).toEqual([]);
});

test('the Pokémon count sits on its own line under the partner',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.team.push({pi:PKM.findIndex(p=>p.n==='Pidgey'),level:4,xp:0,shiny:false});
    roundFarewell='Simon';
    view='who';
    renderWho();
  });
  const card=page.locator('[data-pick]').filter({hasText:'Simon'});
  await expect(card.locator('.who-mon')).toHaveText('Bulbasaur · Lv 60');
  await expect(card.locator('.who-count')).toHaveText('2 Pokémon');
  await expect(card.locator('.who-mon')).not.toContainText('Pokémon');
  const mon=await card.locator('.who-mon').boundingBox();
  const count=await card.locator('.who-count').boundingBox();
  expect(count.y).toBeGreaterThanOrEqual(mon.y+mon.height-1);
  expect(errors).toEqual([]);
});

test('round XP is this round only, and a bonus catch does not add to it',async({page})=>{
  test.setTimeout(60000);
  const errors=await boot(page);
  await state(page,()=>{
    st.round=freshRound(10);
    st.streak=0;
    st.review=[];
    st.warmup={sub:'math',home:1,tier:1,topic:'',queue:[0],at:0};
    loadQuestion();
  });
  await answer(page,true);
  expect(await state(page,()=>st.round.xp),'a warm-up pays the flat rate once').toBe(await state(page,()=>XP_BASE));
  expect(await state(page,()=>st.round.xp)).not.toBe(await state(page,()=>xpForStreak(1)));

  await state(page,()=>{
    st.warmup=null;
    st.review=[];
    st.streak=0;
    st.round=freshRound(10);
    st.phase='play';
    loadQuestion();
  });
  await playAnswers(page,10,10);
  const ladder=await state(page,()=>{
    let xp=0;
    for(let s=1;s<=10;s++)xp+=xpForStreak(s)+milestoneBonus(s);
    return xp;
  });
  expect(await state(page,()=>st.round.xp)).toBe(ladder);
  await state(page,()=>{
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild.pi=pi;st.wild.shiny=false;st.wild.correctStreak=0;st.wild.misses=0;
    refillQuestion();render();
  });
  for(let i=0;i<3;i++){
    await answer(page,true);
    if(await state(page,()=>st.wild&&st.wild.correctStreak<3))await page.click('#nxt');
  }
  await page.click('#nxt');
  await expect(page.locator('#round-done')).toBeVisible({timeout:20000});
  expect(await state(page,()=>st.round.xp),'the catch is not added again').toBe(ladder);
  await expect(page.locator('#round-xp')).toHaveText(`${ladder} XP`);

  await releaseRound(page);
  await page.click('#round-again');
  await answer(page,true);
  const one=await state(page,()=>xpForStreak(st.streak)+milestoneBonus(st.streak));
  expect(await state(page,()=>st.round.xp)).toBe(one);
  expect(one).toBeLessThan(ladder);

  const held=await state(page,()=>st.round.xp);
  await state(page,()=>{
    st.gymOffer.math={tier:1,cool:0};
    st.stats.math.level=1;
    st.badges.math=[];
    st.cor=true;
    st.phase='play';
    render();
  });
  await page.click('[data-gym-start="math"]');
  await answer(page,true);
  expect(await state(page,()=>({n:st.round.n,xp:st.round.xp}))).toEqual({n:1,xp:held});
  expect(errors).toEqual([]);
});

test('round done and who\'s playing have no countdown or come-back copy',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,10,6);
  await expect(page.locator('#round-done')).toBeVisible();
  const roundText=await page.locator('#round-done').innerText();
  expect(roundText).not.toMatch(BANNED);
  expect(roundText).toContain('Round done!');
  await page.waitForTimeout(400);
  await expect(page.locator('#round-done')).toBeVisible();
  expect(await state(page,()=>st.phase)).toBe('round');

  await releaseRound(page);
  await page.click('#round-done-exit');
  await expect(page.locator('#who-screen')).toBeVisible();
  await expect(page.locator('#who-farewell')).toHaveText('Great playing, Simon!');
  await expect(page.locator('.qtext')).toHaveCount(0);
  const whoText=await page.locator('#who-screen').innerText();
  expect(whoText).not.toMatch(BANNED);
  expect(whoText).toContain("Who's playing?");
  expect(errors).toEqual([]);
});

test('play again starts a new round at 0 and does not start by itself',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,10,6);
  await releaseRound(page);
  await page.click('#round-again');
  await expect(page.locator('.qtext')).toBeVisible();
  await expect(page.locator('#round-done')).toHaveCount(0);
  expect(await state(page,()=>({n:st.round.n,right:st.round.right,len:st.round.len}))).toEqual({n:0,right:0,len:10});
  expect(await page.locator('.round-dot[data-on="1"]').count()).toBe(0);
  expect(await page.locator('.round-dot').count()).toBe(10);
  await page.waitForTimeout(400);
  expect(await state(page,()=>st.round.n)).toBe(0);
  expect(errors).toEqual([]);
});

test('reloading at question 6 of 10 resumes at 6',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,6,6);
  await page.click('#nxt');
  const mid=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.round);
  expect(mid.n).toBe(6);
  expect(mid.right).toBe(6);
  expect(mid.len).toBe(10);
  await page.reload();
  expect(await state(page,()=>({n:st.round.n,right:st.round.right,len:st.round.len,phase:st.phase}))).toEqual({
    n:6,right:6,len:10,phase:'play',
  });
  expect(await page.locator('.round-dot[data-on="1"]').count()).toBe(6);
  expect(await page.locator('.round-dot').count()).toBe(10);
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(7);
  expect(errors).toEqual([]);
});

test('an old save starts a new round and keeps the team, dex, badges, and items',async({page})=>{
  const data=kidData({
    stats:{
      math:{cor:20,att:22,level:2,cs:1,ws:0},
      reading:{cor:0,att:0,level:1,cs:0,ws:0},
      science:{cor:0,att:0,level:1,cs:0,ws:0},
    },
    badges:{math:[1],reading:[],science:[]},
    items:{candy:3,great:2},
    dex:['#001','#025'],
    log:{
      '2026-11-17':{'math|@|1':'1'.repeat(20)},
      '2026-11-18':{'math|@|1':'1'.repeat(20)},
    },
  });
  const errors=await openGame(page,{save:{v:1,roster:1,activeId:'simon',kids:[{id:'simon',name:'Simon',avatar:'#001',data}]}});
  expect(await state(page,()=>SAVE_V)).toBe(1);
  const got=await state(page,()=>({
    phase:st.phase,
    n:st.round?st.round.n:0,
    len:st.round?st.round.len:0,
    team:st.team.map(t=>[PKM[t.pi].num,t.level]),
    dex:st.pdx.map((on,i)=>on?PKM[i].num:null).filter(Boolean),
    badges:[...st.badges.math],
    candy:st.items.candy,
    great:st.items.great,
    v:JSON.parse(localStorage.getItem('pkq-save')).v,
  }));
  expect(got.phase).toBe('play');
  expect(got.n).toBe(0);
  expect(got.len).toBe(10);
  expect(got.team).toEqual([['#001',8]]);
  expect(got.dex).toEqual(expect.arrayContaining(['#001','#025']));
  expect(got.badges).toEqual([1]);
  expect(got.candy).toBe(3);
  expect(got.great).toBe(2);
  expect(got.v).toBe(1);
  expect(errors).toEqual([]);
});

test('switching trainer resumes that child\'s own round',async({page})=>{
  const simon=kidData({round:{n:6,right:4,len:10}});
  const maya=kidData({
    team:[{num:'#004',level:5,xp:0}],
    dex:['#004'],
    round:{n:2,right:2,len:10},
  });
  const errors=await openGame(page,{save:{
    v:1,roster:1,activeId:null,
    kids:[
      {id:'simon',name:'Simon',avatar:'#001',data:simon},
      {id:'maya',name:'Maya',avatar:'#004',data:maya},
    ],
  }});
  await expect(page.locator('#who-screen')).toBeVisible();
  await page.locator('[data-pick]').filter({hasText:'Simon'}).click();
  expect(await state(page,()=>({name:activeKid().name,n:st.round.n,right:st.round.right}))).toEqual({
    name:'Simon',n:6,right:4,
  });
  expect(await page.locator('.round-dot[data-on="1"]').count()).toBe(6);
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await state(page,()=>({name:activeKid().name,n:st.round.n,num:PKM[activeTM().pi].num}))).toEqual({
    name:'Maya',n:2,num:'#004',
  });
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Simon'}).click();
  expect(await state(page,()=>st.round.n)).toBe(6);
  expect(await state(page,()=>PKM[activeTM().pi].num)).toBe('#001');
  expect(errors).toEqual([]);
});

test('round length is per child, and 5 and 15 use 4 and 11',async({page})=>{
  test.setTimeout(120000);
  const errors=await boot(page);
  await openParents(page);
  await expect(page.locator('#round-setting')).toBeVisible();
  const gradeBox=await page.locator('#grade-setting').boundingBox();
  const roundBox=await page.locator('#round-setting').boundingBox();
  expect(roundBox.y).toBeGreaterThanOrEqual(gradeBox.y+gradeBox.height-2);
  expect(roundBox.y).toBeLessThanOrEqual(gradeBox.y+gradeBox.height+40);
  await expect(page.locator('#round-setting')).toContainText('Round length');
  const choice=page.locator('#round-setting .grade-choice');
  await expect(choice).toHaveCount(3);
  await expect(page.locator('#round-setting [data-round="10"]')).toHaveAttribute('aria-pressed','true');
  for(const n of ['5','10','15']){
    const box=await page.locator(`#round-setting [data-round="${n}"]`).boundingBox();
    expect(box.height,`round ${n}`).toBeGreaterThanOrEqual(44);
    expect(box.width,`round ${n}`).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#round-setting [data-round="5"]').click();
  await expect(page.locator('#round-setting [data-round="5"]')).toHaveAttribute('aria-pressed','true');
  await backToGame(page);
  await playAnswers(page,5,3);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('.wild-card')).toHaveCount(0);
  await expect(page.locator('#round-line')).toHaveText('3 of 5 right. You and Bulbasaur kept going!');

  await releaseRound(page);
  await page.click('#round-again');
  await openParents(page);
  await page.locator('#round-setting [data-round="5"]').click();
  await backToGame(page);
  // Round 2 would be a trainer battle. Keep this one a bonus catch.
  await state(page,()=>{st.roundsDone=2;if(st.route){st.route.step=2;st.route.announce=null;st.route.debut=false;}});
  await playAnswers(page,5,4);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  expect(await state(page,()=>st.round.n)).toBe(5);

  // A second child keeps his own length. Simon stays on 5.
  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('[data-avatar="004"]');
  await page.click('#profile-save');
  await page.evaluate(()=>{pickStarter(1,false);chooseSubject('math');});
  await openParents(page);
  const maya=page.locator('#round-setting .round-row').filter({hasText:'Maya'});
  const simon=page.locator('#round-setting .round-row').filter({hasText:'Simon'});
  await maya.locator('[data-round="15"]').click();
  await expect(maya.locator('[data-round="15"]')).toHaveAttribute('aria-pressed','true');
  await expect(simon.locator('[data-round="5"]')).toHaveAttribute('aria-pressed','true');
  const saved=await page.evaluate(()=>{
    return JSON.parse(localStorage.getItem('pkq-save')).kids.map(k=>({
      name:k.name,
      round:k.data&&k.data.settings&&k.data.settings.round,
    }));
  });
  expect(saved).toEqual([{name:'Simon',round:5},{name:'Maya',round:15}]);
  await page.reload();
  await page.click('#parents-link');
  await passParentGate(page);
  await expect(page.locator('#round-setting .round-row').filter({hasText:'Maya'}).locator('[data-round="15"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#round-setting .round-row').filter({hasText:'Simon'}).locator('[data-round="5"]')).toHaveAttribute('aria-pressed','true');
  await page.click('#parent-back');
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  await state(page,()=>{
    const tm=activeTM();
    tm.level=60;tm.xp=-8000;st.pendingEvo=null;
    Math.random=()=>0.99;
  });
  await playAnswers(page,15,10);
  await expect(page.locator('#round-done')).toBeVisible();
  await expect(page.locator('.wild-card')).toHaveCount(0);
  await expect(page.locator('#round-line')).toContainText('10 of 15 right');
  await releaseRound(page);
  await page.click('#round-again');
  // Maya's second finished round would be her trainer battle.
  await state(page,()=>{st.roundsDone=2;if(st.route){st.route.step=2;st.route.announce=null;st.route.debut=false;}});
  await playAnswers(page,15,11);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>({n:st.round.n,right:st.round.right,bonus:!!st.bonusWild}))).toEqual({
    n:15,right:11,bonus:true,
  });
  expect(errors).toEqual([]);
});

test('a longer length waits until the next round, and a shorter one already reached ends after this question',async({page})=>{
  test.setTimeout(90000);
  const errors=await boot(page);
  await playAnswers(page,3,3);
  await page.click('#nxt');
  expect(await state(page,()=>st.round.len)).toBe(10);
  await openParents(page);
  await page.locator('#round-setting [data-round="15"]').click();
  await backToGame(page);
  await expect(page.locator('.qtext')).toBeVisible();
  expect(await state(page,()=>({n:st.round.n,len:st.round.len,pref:st.roundPref}))).toEqual({n:3,len:10,pref:15});
  await answer(page,true);
  await page.click('#nxt');
  expect(await state(page,()=>({n:st.round.n,len:st.round.len,phase:st.phase}))).toEqual({n:4,len:10,phase:'play'});

  // Finish this 10. The next round is 15.
  await playAnswers(page,6,6);
  await expect(page.locator('.wild-card')).toBeVisible();
  await bonusRunsOff(page);
  await expect(page.locator('#round-done')).toBeVisible();
  await releaseRound(page);
  await page.click('#round-again');
  expect(await state(page,()=>st.round.len)).toBe(15);
  expect(await page.locator('.round-dot').count()).toBe(15);

  await openParents(page);
  await page.locator('#round-setting [data-round="10"]').click();
  await backToGame(page);
  await playAnswers(page,6,6);
  await page.click('#nxt');
  expect(await state(page,()=>st.round.n)).toBe(6);
  await openParents(page);
  await page.locator('#round-setting [data-round="5"]').click();
  await backToGame(page);
  await expect(page.locator('#round-done')).toHaveCount(0);
  await expect(page.locator('.qtext')).toBeVisible();
  // Six right is enough for a round of 5 (the line is 4) and not for a round of 10.
  // This is the second finished round, which would be a trainer battle.
  await state(page,()=>{st.roundsDone=2;if(st.route){st.route.step=2;st.route.announce=null;st.route.debut=false;}});
  await state(page,()=>askForHelp());
  await answer(page,true);
  await expect(page.locator('.wild-card')).toBeVisible();
  expect(await state(page,()=>st.round.right)).toBe(6);
  expect(await state(page,()=>st.round.n)).toBeGreaterThanOrEqual(5);
  expect(await state(page,()=>st.bonusWild)).toBe(true);
  expect(errors).toEqual([]);
});

test('warm-up, review, rematch, and a wild question each count once',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=2;
    st.badges.math=[1];
    st.log={
      '2026-11-17':{'math|@|1':'1'.repeat(20)},
      '2026-11-18':{'math|@|1':'1'.repeat(20)},
    };
    st.warmup={sub:'math',home:2,tier:1,topic:'',queue:[0,1,2],at:0};
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.warmup)).toBe(true);
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(1);
  await page.click('#nxt');

  await state(page,()=>{
    st.warmup=null;
    st.reviewCount.math=4;
    st.review=[];
    st.stats.math.level=2;
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.bankReview)).toBe(true);
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(2);

  await state(page,()=>{
    st.review=[{sub:'math',lv:1,idx:0,wins:0,due:0,why:'miss'}];
    st.served=20;st.lastRematchAt=null;
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.rematch)).toBe(true);
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(3);

  await state(page,()=>{st.review=[];triggerWildEncounter(false);});
  expect(await state(page,()=>st.phase)).toBe('wild');
  await answer(page,true);
  expect(await state(page,()=>st.round.n)).toBe(4);
  expect(errors).toEqual([]);
});

test('a Gym award ends the round, and a held invite still waits out an evolution',async({page})=>{
  const errors=await boot(page);
  await playAnswers(page,2,2);
  await state(page,()=>{
    st.gymOffer.math={tier:1,cool:0};
    st.stats.math.level=1;
    st.badges.math=[];
    st.cor=true;
    st.pendingEvo={fromPi:activeTM().pi,toPi:activeTM().pi+1};
    st.lvlUpMsg=null;
    render();
  });
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  expect(await state(page,()=>({n:st.round.n,phase:st.phase}))).toEqual({n:2,phase:'play'});
  await state(page,()=>{st.pendingEvo=null;st.lvlUpMsg=null;render();});
  await expect(page.locator('.gym-invite')).toBeVisible();
  expect(await state(page,()=>st.round.n)).toBe(2);
  await page.click('[data-gym-start="math"]');
  await answer(page,true);
  expect(await state(page,()=>st.round.n),'a Gym question does not move the round').toBe(2);
  await page.click('#gym-forfeit');
  await page.click('#gym-forfeit-yes');
  await page.click('#gym-back');
  expect(await state(page,()=>st.round.n)).toBe(2);

  await state(page,()=>{
    st.gymOffer.math={tier:1,cool:0};
    st.cor=true;
    st.phase='play';
    render();
  });
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await expect(page.locator('.award-card')).toBeVisible();
  await expect(page.locator('#award-go')).toHaveText('Play again');
  await expect(page.locator('#round-done-exit')).toHaveText('Done');
  const again=await page.locator('#award-go').boundingBox();
  const done=await page.locator('#round-done-exit').boundingBox();
  expect(again.height).toBeGreaterThanOrEqual(44);
  expect(done.height).toBeGreaterThanOrEqual(44);
  expect(await state(page,()=>st.round.n)).toBe(0);
  await releaseRound(page);
  await page.click('#round-done-exit');
  await expect(page.locator('#who-farewell')).toHaveText('Great playing, Simon!');
  expect(errors).toEqual([]);
});

test('Reduce Motion keeps the round celebration still',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=await boot(page);
  await playAnswers(page,10,6);
  await expect(page.locator('#round-done')).toBeVisible();
  const anim=await page.locator('#round-celebrate').evaluate(el=>getComputedStyle(el).animationName);
  expect(anim).toBe('none');
  expect(errors).toEqual([]);
});

test('the round screen and the dotted question fit an iPad and a phone',async({page})=>{
  test.setTimeout(180000);
  const errors=await boot(page);
  fs.mkdirSync(ART,{recursive:true});

  // Dots share the question with a streak pill. Three sizes, no scroll.
  await playAnswers(page,3,3);
  await page.click('#nxt');
  expect(await page.locator('.round-dot').count()).toBe(10);
  expect(await page.locator('.round-dot[data-on="1"]').count()).toBe(3);
  const dot=page.locator('.round-dot').first();
  const box=await dot.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(9);
  expect(box.width).toBeLessThanOrEqual(11.5);
  expect(box.height).toBeGreaterThanOrEqual(9);
  expect(box.height).toBeLessThanOrEqual(11.5);
  expect(await dot.evaluate(el=>el.tagName)).not.toBe('BUTTON');
  expect(await dot.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');

  for(const size of [{width:768,height:1024},{width:1024,height:768},{width:390,height:844}]){
    await page.setViewportSize(size);
    const where=`${size.width}x${size.height}`;
    const fit=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      const dot=document.querySelector('.round-dot').getBoundingClientRect();
      const head=document.querySelector('.q-head');
      const hr=head?head.getBoundingClientRect():null;
      const xp=document.querySelector('#game .xp-track').getBoundingClientRect();
      const img=document.querySelector('#game .mon-strip img').getBoundingClientRect();
      const inHead=!!(hr&&dot.top>=hr.top-2&&dot.bottom<=hr.bottom+2);
      const under=dot.top>=xp.bottom-2&&dot.top<=xp.bottom+36;
      return {scroll:main.scrollHeight-main.clientHeight,inHead,under,hero:img.height};
    });
    expect(fit.scroll,where).toBeLessThanOrEqual(1);
    expect(fit.inHead||fit.under,where).toBe(true);
    if(size.width>=768){
      expect(fit.hero,where).toBeGreaterThanOrEqual(190);
      expect(fit.hero,where).toBeLessThanOrEqual(210);
    }
  }
  await page.setViewportSize({width:768,height:1024});
  await page.screenshot({path:ART+'/question_dots_768x1024.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:ART+'/question_playing_dots_390x844.png'});

  await page.setViewportSize({width:768,height:1024});
  await openParents(page);
  await page.locator('#round-setting').scrollIntoViewIfNeeded();
  await page.screenshot({path:ART+'/parents_round_length_768x1024.png'});
  await backToGame(page);

  // Six clean, four helped: the done screen with no encounter.
  await playAnswers(page,7,3);
  await expect(page.locator('#round-done')).toBeVisible();
  await page.screenshot({path:ART+'/round_done_none_768x1024.png'});

  await releaseRound(page);
  await page.click('#round-again');
  // The second finished round is a trainer battle. These shots are the catch.
  await state(page,()=>{st.roundsDone=2;if(st.route){st.route.step=2;st.route.announce=null;st.route.debut=false;}});
  await playAnswers(page,10,7);
  await state(page,()=>{
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild.pi=pi;st.wild.shiny=false;st.wild.correctStreak=0;st.wild.misses=0;
    refillQuestion();render();
  });
  await bonusRunsOff(page);
  await expect(page.locator('#round-bonus')).toHaveText('Pidgey got away this time. Great work!');
  await page.setViewportSize({width:768,height:1024});
  await page.screenshot({path:ART+'/round_done_ran_off_768x1024.png'});

  await releaseRound(page);
  await page.click('#round-again');
  await playAnswers(page,10,8);
  await state(page,()=>{
    const pi=PKM.findIndex(p=>p.n==='Pidgey');
    st.wild.pi=pi;st.wild.shiny=false;st.wild.correctStreak=0;st.wild.misses=0;
    refillQuestion();render();
  });
  for(let i=0;i<3;i++){
    await answer(page,true);
    if(await state(page,()=>st.wild.correctStreak<3))await page.click('#nxt');
  }
  await page.click('#nxt');
  await expect(page.locator('#round-done')).toBeVisible({timeout:20000});
  await expect(page.locator('#round-bonus')).toHaveText('Pidgey joined your team!');

  for(const size of [{width:768,height:1024},{width:1024,height:768},{width:390,height:844}]){
    await page.setViewportSize(size);
    const where=`round ${size.width}x${size.height}`;
    const fit=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      const img=document.querySelector('#round-done img');
      const ir=img?img.getBoundingClientRect():{height:0};
      const line=document.querySelector('#round-line');
      const title=document.querySelector('#round-title');
      const small=[];
      const root=document.getElementById('round-done');
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
        const sizePx=parseFloat(s.fontSize);
        if(sizePx<14)small.push(node.textContent.trim().slice(0,24)+' '+sizePx);
      }
      return {
        scroll:main.scrollHeight-main.clientHeight,
        hero:ir.height,
        line:parseFloat(getComputedStyle(line).fontSize),
        title:parseFloat(getComputedStyle(title).fontSize),
        small,
      };
    });
    expect(fit.scroll,where).toBeLessThanOrEqual(1);
    expect(fit.line,where).toBeGreaterThanOrEqual(20);
    expect(fit.title,where).toBeGreaterThanOrEqual(20);
    expect(fit.small,where).toEqual([]);
    expect(fit.hero,where).toBeGreaterThanOrEqual(size.width>=768?92:52);
    expect(fit.hero,where).toBeLessThanOrEqual(size.width>=768?100:60);
    for(const id of ['#round-again','#round-done-exit']){
      const b=await page.locator(id).boundingBox();
      expect(b.height,`${where} ${id}`).toBeGreaterThanOrEqual(64);
      expect(b.width,`${where} ${id}`).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({path:`${ART}/round_done_catch_${size.width}x${size.height}.png`});
  }

  await page.setViewportSize({width:768,height:1024});
  await releaseRound(page);
  await page.click('#round-done-exit');
  await expect(page.locator('#who-farewell')).toHaveText('Great playing, Simon!');
  await page.screenshot({path:ART+'/who_great_playing_768x1024.png'});
  expect(errors).toEqual([]);
});
