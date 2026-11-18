// A run of misses on the current tier starts a short warm-up. It does not
// drop a level. A real drop is one tier, and only when the current tier's
// own tape is under 60% over the last 20 tries on 2 local days.
const {test,expect}=require('@playwright/test');
const fs=require('fs');
const {openGame,startGame,state,answer,nextQuestion}=require('./helpers');

const DAY=new Date(2026,10,18,9,0,0);
const ART='/opt/cursor/artifacts';

async function boot(page){
  await page.clock.install({time:DAY});
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    const tm=activeTM();
    tm.level=60;tm.xp=-8000;st.pendingEvo=null;
    const line=LINES.find(ln=>ln.includes(tm.pi))||LINES[0];
    tm.pi=line[line.length-1];
    st.grade=0;
    st.stats.math.level=2;
    st.stats.math.cs=0;
    st.stats.math.ws=0;
    st.badges.math=[1];
    st.gymOffer.math=null;
    st.review=[];
    st.log={
      '2026-11-16':{'math|@|1':'1'.repeat(20)},
      '2026-11-17':{'math|@|1':'1'.repeat(20)},
    };
  });
  return errors;
}

function missTier(page,lv,idx){
  return state(page,({lv,idx})=>{
    st.phase='play';st.gym=null;st.wild=null;
    st.q=serveQuestion('math',lv,idx,questionPname());
    st.tries=0;st.wrong=[];st.helped=false;st.armAt=0;st.cor=false;st.draft='';
    commitAttempt(false,st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex));
  },{lv,idx});
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

test('three current-tier misses start a warm-up and the level stays',async({page})=>{
  const errors=await boot(page);
  const before=await state(page,()=>({
    level:st.stats.math.level,
    badges:[...st.badges.math],
    fill:null,
  }));
  for(let i=0;i<2;i++)await missTier(page,2,i);
  expect(await state(page,()=>st.warmup||null)).toBeNull();
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  await missTier(page,2,2);
  const started=await state(page,()=>({
    level:st.stats.math.level,
    badges:[...st.badges.math],
    home:st.warmup&&st.warmup.home,
    tier:st.warmup&&st.warmup.tier,
    left:st.warmup&&st.warmup.queue&&st.warmup.queue.length,
  }));
  expect(started).toEqual({level:2,badges:[1],home:2,tier:1,left:3});
  await nextQuestion(page);
  const name=await state(page,()=>PKM[activePi()].n);
  await expect(page.locator('.warmup-say')).toContainText("Let's do a quick warm-up!");
  await expect(page.locator('.warmup-say')).toContainText(name);
  await expect(page.locator('.warmup-tag')).toHaveText('Warm-up');
  await expect(page.locator('.streak-pill')).toHaveCount(0);
  const card=await page.locator('.qcard').innerText();
  expect(card).not.toMatch(/level down|dropped|too hard/i);
  const dealt=await state(page,()=>({lv:st.q.tmpl.lv,warm:!!st.q.warmup,level:st.stats.math.level}));
  expect(dealt).toEqual({lv:1,warm:true,level:2});
  const fill=await page.locator('.gym-ring').getAttribute('data-fill');
  expect(fill).toBe(before.fill===null?fill:before.fill);
  expect(errors).toEqual([]);
});

test('the warm-up returns to the same level after 3 questions',async({page})=>{
  const errors=await boot(page);
  for(let i=0;i<3;i++)await missTier(page,2,i);
  const logBefore=await state(page,()=>JSON.stringify(st.log));
  const fillBefore=await (async()=>{await nextQuestion(page);return page.locator('.gym-ring').getAttribute('data-fill');})();
  await state(page,()=>{Math.random=()=>0.99;});
  for(let i=0;i<3;i++){
    expect(await state(page,()=>!!st.q.warmup)).toBe(true);
    expect(await state(page,()=>st.q.tmpl.lv)).toBe(1);
    await answer(page,true);
    await page.click('#nxt');
  }
  const name=await state(page,()=>PKM[activePi()].n);
  await expect(page.locator('body')).toContainText('Back to it!');
  await expect(page.locator('.warmup-tag')).toHaveCount(0);
  const back=await state(page,()=>({
    level:st.stats.math.level,
    lv:st.q.tmpl.lv,
    warm:!!st.q.warmup,
    pending:st.warmup||null,
    fill:document.querySelector('.gym-ring').getAttribute('data-fill'),
  }));
  expect(back.level).toBe(2);
  expect(back.lv).toBe(2);
  expect(back.warm).toBe(false);
  expect(back.pending).toBeNull();
  expect(back.fill).toBe(fillBefore);
  expect(await state(page,()=>JSON.stringify(st.log))).toBe(logBefore);
  expect(await page.locator('.qcard').innerText()).toContain(name);
  expect(errors).toEqual([]);
});

test('review, Rematch, and Gym misses do not start a warm-up',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{st.stats.math.ws=2;});
  await state(page,()=>{
    st.reviewCount.math=4;
    st.review=[];
    st.seen=[];
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.bankReview)).toBe(true);
  await answer(page,false);
  expect(await state(page,()=>({level:st.stats.math.level,ws:st.stats.math.ws,warm:st.warmup||null}))).toEqual({
    level:2,ws:2,warm:null,
  });

  await state(page,()=>{
    st.phase='play';st.gym=null;
    st.review=[{sub:'math',lv:2,idx:1,wins:0,due:0,why:'miss'}];
    st.served=20;st.lastRematchAt=null;
    loadQuestion();
  });
  expect(await state(page,()=>!!st.q.rematch)).toBe(true);
  await answer(page,false);
  expect(await state(page,()=>({ws:st.stats.math.ws,warm:st.warmup||null,level:st.stats.math.level}))).toEqual({
    ws:2,warm:null,level:2,
  });

  await state(page,()=>{
    st.phase='play';st.gymOffer.math={tier:2,cool:0};st.cor=true;st.badges.math=[1];
    render();
  });
  await page.click('[data-gym-start="math"]');
  await answer(page,false);
  expect(await state(page,()=>({
    level:st.stats.math.level,ws:st.stats.math.ws,warm:st.warmup||null,phase:st.phase,
  }))).toEqual({level:2,ws:2,warm:null,phase:'gym'});
  expect(errors).toEqual([]);
});

test('a reload mid-warm-up keeps the same queue and does not restart it',async({page})=>{
  const errors=await boot(page);
  for(let i=0;i<3;i++)await missTier(page,2,i);
  await nextQuestion(page);
  const first=await state(page,()=>({idx:st.q.tmpl.idx,queue:st.warmup.queue.slice(),at:st.warmup.at}));
  expect(first.idx).toBe(first.queue[0]);
  await answer(page,true);
  await page.reload();
  const mid=await state(page,()=>({
    level:st.stats.math.level,
    idx:st.q.tmpl.idx,
    queue:st.warmup&&st.warmup.queue.slice(),
    at:st.warmup&&st.warmup.at,
    warm:!!(st.q&&st.q.warmup),
    badges:[...st.badges.math],
  }));
  expect(mid.level).toBe(2);
  expect(mid.badges).toEqual([1]);
  expect(mid.queue).toEqual(first.queue);
  expect(mid.at).toBe(1);
  expect(mid.idx).toBe(first.queue[1]);
  expect(mid.idx).not.toBe(first.queue[0]);
  expect(mid.warm).toBe(true);
  await expect(page.locator('.warmup-tag')).toHaveText('Warm-up');
  expect(errors).toEqual([]);
});

test('kindergarten serves 3 gentler tier-1 questions and stays on tier 1',async({page})=>{
  // No tier below Kindergarten. The warm-up stays on tier 1 and picks the
  // gentlest other questions: same topic first, then the smallest number in
  // the stem (a stem with no number counts as the gentlest). The question
  // that triggered the warm-up is skipped.
  const errors=await boot(page);
  const plan=await state(page,()=>{
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math=null;
    const topicAt=i=>questionTopic('math',QB.math[1][i][0]);
    const ease=stem=>{
      const nums=String(stem).match(/\d+/g);
      return nums?Math.max(...nums.map(Number)):0;
    };
    const topic=topicAt(0);
    const same=[];
    QB.math[1].forEach((q,i)=>{if(topicAt(i)===topic)same.push(i);});
    return {topic,idxs:same.slice(0,3),easeOf:QB.math[1].map(q=>ease(q[0]))};
  });
  expect(plan.idxs.length).toBe(3);
  for(const idx of plan.idxs)await missTier(page,1,idx);
  const got=await state(page,()=>({level:st.stats.math.level,tier:st.warmup&&st.warmup.tier,home:st.warmup&&st.warmup.home,queue:st.warmup&&st.warmup.queue.slice()}));
  expect(got.level).toBe(1);
  expect(got.home).toBe(1);
  expect(got.tier).toBe(1);
  const expected=await state(page,({topic,avoid})=>{
    const ease=stem=>{
      const nums=String(stem).match(/\d+/g);
      return nums?Math.max(...nums.map(Number)):0;
    };
    const rows=QB.math[1].map((q,idx)=>({idx,topic:questionTopic('math',q[0]),ease:ease(q[0])})).filter(r=>r.idx!==avoid);
    rows.sort((a,b)=>{
      const at=a.topic===topic?0:1,bt=b.topic===topic?0:1;
      if(at!==bt)return at-bt;
      if(a.ease!==b.ease)return a.ease-b.ease;
      return a.idx-b.idx;
    });
    return rows.slice(0,3).map(r=>r.idx);
  },{topic:plan.topic,avoid:plan.idxs[2]});
  expect(got.queue).toEqual(expected);
  expect(got.queue).not.toContain(plan.idxs[2]);
  await nextQuestion(page);
  expect(await state(page,()=>st.q.tmpl.lv)).toBe(1);
  await expect(page.locator('.warmup-say')).toContainText("Let's do a quick warm-up!");
  const tape=await state(page,()=>{
    const day=localISO(new Date());
    return (st.log[day]&&st.log[day]['math|@|1'])||'';
  });
  await answer(page,true);
  const after=await state(page,()=>{
    const day=localISO(new Date());
    return (st.log[day]&&st.log[day]['math|@|1'])||'';
  });
  expect(after).toBe(tape);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  expect(errors).toEqual([]);
});

test('a warm-up pays no streak bonus, opens no Gym, and rolls no catch',async({page})=>{
  const errors=await boot(page);
  for(let i=0;i<3;i++)await missTier(page,2,i);
  await nextQuestion(page);
  const snapBefore=await state(page,()=>masterySnapshot(st.log,'math',2));
  const lowerBefore=await state(page,()=>masterySnapshot(st.log,'math',1));
  await state(page,()=>{
    st.streak=4;
    st.gymOffer.math=null;
    Math.random=()=>0;
  });
  await answer(page,true);
  const paid=await state(page,()=>({
    streak:st.streak,
    msg:st.streakMsg,
    xp:st.lastXp,
    offer:st.gymOffer.math,
    level:st.stats.math.level,
  }));
  expect(paid.streak).toBe(4);
  expect(paid.msg).toBeFalsy();
  expect(paid.xp).toBe(await state(page,()=>XP_BASE));
  expect(paid.offer).toBeNull();
  expect(paid.level).toBe(2);
  await page.click('#nxt');
  expect(await state(page,()=>({phase:st.phase,wild:st.wild}))).toEqual({phase:'play',wild:null});
  expect(await state(page,()=>masterySnapshot(st.log,'math',2))).toEqual(snapBefore);
  expect(await state(page,()=>masterySnapshot(st.log,'math',1))).toEqual(lowerBefore);
  expect(errors).toEqual([]);
});

test('under 60% over 20 tries on 2 days drops one tier, silently, with a Parents line',async({page})=>{
  const errors=await boot(page);
  const kept=await state(page,()=>{
    st.stats.math.level=2;
    st.badges.math=[1,2];
    st.items.candy=2;st.items.great=1;
    st.log['2026-11-17']['math|@|2']='0'.repeat(10);
    st.log['2026-11-18']={'math|@|2':'0'.repeat(9)};
    return {
      team:st.team.map(t=>PKM[t.pi].num+':'+t.level),
      dex:st.pdx.filter(Boolean).length,
      candy:st.items.candy,
      great:st.items.great,
    };
  });
  await missTier(page,2,5);
  const dropped=await state(page,()=>({
    level:st.stats.math.level,
    badges:[...st.badges.math].sort(),
    offer:st.gymOffer.math,
    warm:st.warmup||null,
    moves:st.moves||[],
  }));
  expect(dropped.level).toBe(1);
  expect(dropped.badges).toEqual([1,2]);
  expect(dropped.offer).toBeNull();
  expect(dropped.warm).toBeNull();
  expect(dropped.moves).toEqual([{sub:'math',tier:1,from:2,day:'2026-11-18'}]);
  const screen=await page.locator('#game').innerText();
  expect(screen).not.toMatch(/level down|Moved to|dropped/i);
  await nextQuestion(page);
  expect(await state(page,()=>st.q.tmpl.lv)).toBe(1);
  await expect(page.locator('.warmup-tag')).toHaveCount(0);
  await expect(page.locator('#game')).not.toContainText('Moved to Kindergarten');
  const still=await state(page,()=>({
    team:st.team.map(t=>PKM[t.pi].num+':'+t.level),
    dex:st.pdx.filter(Boolean).length,
    candy:st.items.candy,
    great:st.items.great,
  }));
  expect(still).toEqual(kept);
  expect(await state(page,()=>SAVE_V)).toBe(1);

  await page.setViewportSize({width:768,height:1024});
  await openParents(page);
  const line=page.locator('.parent-move');
  await expect(line).toHaveText('Moved from 1st grade to Kindergarten practice on Nov 18 (under 60% right on his last 20 tries).');
  // The drop is real: Kindergarten was already mastered, so the old Gym line
  // quoted that 100% and still promised a Gym. He holds the badge, and the
  // ring is refilling, so the line has to follow that gate.
  const gym=await page.locator('.prog-gym').innerText();
  const gate=await state(page,()=>{
    const snap=masterySnapshot(st.log,'math',1,st.redo&&st.redo.math);
    return {open:!!(snap.gate&&snap.gate.open),pct:snap.gate.pct,att:snap.gate.att,days:snap.gate.days};
  });
  expect(gate.open).toBe(false);
  expect(gate.att).toBe(0);
  expect(gym).toContain('Kindergarten: just started. Back to 1st grade at 85% right');
  expect(gym).not.toContain('0%');
  expect(gym).not.toContain('100%');
  expect(gym).not.toContain('Opens at 85%');
  expect(gym).not.toMatch(/\bGym\b/);
  await line.scrollIntoViewIfNeeded();
  fs.mkdirSync(ART,{recursive:true});
  await page.screenshot({path:ART+'/parents_drop_log_768x1024.png'});
  expect(errors).toEqual([]);
});

test('under 60% on only 1 day does not drop',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.ws=2;
    st.log['2026-11-18']={'math|@|2':'0'.repeat(19)};
  });
  await missTier(page,2,6);
  expect(await state(page,()=>({
    level:st.stats.math.level,
    warm:!!st.warmup,
    moves:st.moves||[],
  }))).toEqual({level:2,warm:true,moves:[]});
  await openParents(page);
  await expect(page.locator('.parent-move')).toHaveCount(0);
  await expect(page.locator('#parent-report')).not.toContainText('accuracy under 60%');
  expect(errors).toEqual([]);
});

test('exactly 60% over the last 20 does not drop, and 19 tries do not either',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.log['2026-11-17']['math|@|2']='1'.repeat(11);
    st.log['2026-11-18']={'math|@|2':'0'.repeat(8)};
  });
  await state(page,()=>{
    st.phase='play';st.gym=null;
    st.q=serveQuestion('math',2,7,questionPname());
    st.tries=0;st.wrong=[];st.helped=false;st.armAt=0;st.cor=false;
    commitAttempt(true,st.q.correctIndex);
  });
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(await state(page,()=>st.moves||[])).toEqual([]);

  await state(page,()=>{
    st.stats.math.level=2;
    st.stats.math.ws=0;
    st.moves=[];
    st.log['2026-11-17']['math|@|2']='0'.repeat(10);
    st.log['2026-11-18']['math|@|2']='0'.repeat(8);
  });
  await missTier(page,2,8);
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  expect(errors).toEqual([]);
});

test('badges stay and a reload keeps the one-tier drop',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.badges.math=[1,2];
    st.log['2026-11-17']['math|@|2']='1'.repeat(5)+'0'.repeat(5);
    st.log['2026-11-18']={'math|@|2':'0'.repeat(10)};
  });
  await missTier(page,2,9);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  await page.reload();
  expect(await state(page,()=>({
    level:st.stats.math.level,
    badges:[...st.badges.math].sort(),
    moves:(st.moves||[]).map(m=>m.tier+':'+m.day),
    v:SAVE_V,
  }))).toEqual({level:1,badges:[1,2],moves:['1:2026-11-18'],v:1});
  // The miss is still a Rematch. Set that aside and the new questions are
  // the lower tier.
  await state(page,()=>{st.review=[];st.lastRematchAt=null;});
  await nextQuestion(page);
  expect(await state(page,()=>({lv:st.q.tmpl.lv,level:st.stats.math.level}))).toEqual({lv:1,level:1});
  expect(errors).toEqual([]);
});

test('the next correct answer refills the lower ring and does not open a second Gym',async({page})=>{
  const errors=await boot(page);
  await state(page,()=>{
    st.badges.math=[1];
    st.log['2026-11-17']['math|@|2']='0'.repeat(10);
    st.log['2026-11-18']={'math|@|2':'0'.repeat(9)};
  });
  await missTier(page,2,10);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  await nextQuestion(page);
  await answer(page,true);
  const stayed=await state(page,()=>({
    level:st.stats.math.level,
    offer:st.gymOffer.math,
    badges:[...st.badges.math],
    fill:document.querySelector('.gym-ring').getAttribute('data-fill'),
  }));
  expect(stayed.level).toBe(1);
  expect(stayed.offer).toBeNull();
  expect(stayed.badges).toEqual([1]);
  expect(Number(stayed.fill)).toBeLessThan(0.2);
  expect(errors).toEqual([]);
});

test('a save with no tape still starts at Kindergarten and logs no accuracy move',async({page})=>{
  const save={
    v:1,roster:1,activeId:'simon',
    kids:[{
      id:'simon',name:'Simon',avatar:'#025',
      data:{
        v:1,starter:0,activeIdx:0,
        team:[{num:'#025',level:12,xp:4}],
        dex:['#025'],
        subject:'math',
        stats:{
          math:{cor:4,att:8,level:3,cs:0,ws:0},
          reading:{cor:0,att:0,level:1,cs:0,ws:0},
          science:{cor:0,att:0,level:1,cs:0,ws:0},
        },
        badges:{math:[1,2],reading:[],science:[]},
        items:{candy:1,great:0},
        settings:{grade:3},
      },
    }],
  };
  await page.clock.install({time:DAY});
  const errors=await openGame(page,{save});
  expect(await state(page,()=>({
    level:st.stats.math.level,
    badges:[...st.badges.math].sort(),
    moves:st.moves||[],
    candy:st.items.candy,
    team:st.team.map(t=>PKM[t.pi].num+':'+t.level+':'+t.xp),
    v:SAVE_V,
  }))).toEqual({
    level:1,badges:[1,2],moves:[],candy:1,team:['#025:12:4'],v:1,
  });
  expect(errors).toEqual([]);
});

test('placement still drops an unproved tier, and that is not a second accuracy drop',async({page})=>{
  // Kindergarten is solid, so the lowest tier that is not solid is 1st grade.
  // A bad 2nd-grade tape makes placement step there. The accuracy rule must
  // not take a second step on the same answer.
  const errors=await boot(page);
  await state(page,()=>{
    st.stats.math.level=3;
    st.badges.math=[1,2];
    st.log['2026-11-17']['math|@|3']='0'.repeat(10);
    st.log['2026-11-18']={'math|@|3':'0'.repeat(10)};
  });
  await missTier(page,3,0);
  const got=await state(page,()=>({level:st.stats.math.level,moves:st.moves||[],badges:[...st.badges.math].sort()}));
  expect(got.level).toBe(2);
  expect(got.badges).toEqual([1,2]);
  expect(got.moves.filter(m=>m.tier!==2)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a mastered tier says the Gym is ready and does not repeat the bar',async({page})=>{
  const errors=await boot(page);
  const solid={
    '2026-11-17':{'math|@|1':'1'.repeat(20)},
    '2026-11-18':{'math|@|1':'1'.repeat(20)},
  };
  const line=await state(page,log=>gymLineText('math',1,log),solid);
  expect(line).toBe('Kindergarten Gym: ready! 100% right over 40 tries on 2 days.');
  expect(line).not.toContain('Opens at 85%');
  const snap=await state(page,log=>masterySnapshot(log,'math',1),solid);
  expect(snap.open).toBe(true);
  expect(line).toContain(`${snap.pct}% right over ${snap.att} tries on ${snap.days} days`);
  expect(errors).toEqual([]);
});

test('a badge he already holds does not promise another Gym',async({page})=>{
  const errors=await boot(page);
  const solid={
    '2026-11-17':{'math|@|1':'1'.repeat(20)},
    '2026-11-18':{'math|@|1':'1'.repeat(20)},
  };
  const line=await state(page,log=>gymLineText('math',1,log,{badge:true}),solid);
  expect(line).toBe('Kindergarten: solid! Back to 1st grade next.');
  expect(line).not.toContain('Gym');
  expect(line).not.toContain('Opens at 85%');
  const locked=await state(page,log=>gymLineText('math',1,log,{badge:true,lock:1}),solid);
  expect(locked).toBe('Kindergarten: solid!');
  expect(locked).not.toContain('1st grade');
  expect(errors).toEqual([]);
});

test('zero tries on a refill says just started, and one try shows the numbers',async({page})=>{
  const errors=await boot(page);
  const none={};
  const one={'2026-11-18':{'math|@|1':'1'}};
  const single=await state(page,log=>gymLineText('math',1,log,{badge:true}),one);
  expect(single).toBe('Kindergarten: 100% right over 1 try on 1 day. Back to 1st grade at 85% (needs 30+ tries on 2+ days).');
  expect(single).not.toContain('just started');
  const empty=await state(page,log=>gymLineText('math',1,log,{badge:true,redo:{tier:1,fresh:0}}),none);
  expect(empty).toBe('Kindergarten: just started. Back to 1st grade at 85% right (needs 30+ tries on 2+ days).');
  const locked=await state(page,log=>gymLineText('math',1,log,{badge:true,lock:1,redo:{tier:1,fresh:0}}),none);
  expect(locked).toBe('Kindergarten: just started.');
  expect(locked).not.toContain('Back to');
  expect(errors).toEqual([]);
});

test('a Gym with no tries yet says just started, and one try shows the numbers',async({page})=>{
  const errors=await boot(page);
  const none={};
  const one={'2026-11-18':{'math|@|1':'0'}};
  const single=await state(page,log=>gymLineText('math',1,log),one);
  expect(single).toBe('Kindergarten Gym: 0% right over 1 try on 1 day. Opens at 85% (needs 30+ tries on 2+ days).');
  expect(single).not.toContain('just started');
  const empty=await state(page,log=>gymLineText('math',1,log),none);
  expect(empty).toBe('Kindergarten Gym: just started. Opens at 85% right (needs 30+ tries on 2+ days).');
  expect(errors).toEqual([]);
});

test('2nd grade with the badge names the climb back to 3rd grade',async({page})=>{
  const errors=await boot(page);
  const one={'2026-11-18':{'math|@|3':'1'}};
  const line=await state(page,log=>gymLineText('math',3,log,{badge:true}),one);
  expect(line).toContain('Back to 3rd grade');
  expect(line).toContain('100% right over 1 try');
  expect(errors).toEqual([]);
});

test('2nd grade with the badge and the bar met says solid and back to 3rd grade',async({page})=>{
  const errors=await boot(page);
  const solid={
    '2026-11-17':{'math|@|3':'1'.repeat(20)},
    '2026-11-18':{'math|@|3':'1'.repeat(20)},
  };
  const line=await state(page,log=>gymLineText('math',3,log,{badge:true}),solid);
  expect(line).toBe('2nd grade: solid! Back to 3rd grade next.');
  expect(errors).toEqual([]);
});

test('2nd grade with no tries yet still names the climb back to 3rd grade',async({page})=>{
  const errors=await boot(page);
  const line=await state(page,log=>gymLineText('math',3,log,{badge:true}),{});
  expect(line).toBe('2nd grade: just started. Back to 3rd grade at 85% right (needs 30+ tries on 2+ days).');
  expect(errors).toEqual([]);
});

test('the warm-up start fits a tablet, a sideways tablet, and a phone',async({page})=>{
  const errors=await boot(page);
  for(let i=0;i<3;i++)await missTier(page,2,i);
  await nextQuestion(page);
  await state(page,()=>{st.armAt=0;render();});
  await expect(page.locator('.warmup-say')).toContainText("Let's do a quick warm-up!");
  await expect(page.locator('.warmup-tag')).toBeVisible();
  fs.mkdirSync(ART,{recursive:true});
  const sizes=[
    {width:768,height:1024,name:'warmup_start_768x1024.png'},
    {width:1024,height:768,name:'warmup_start_1024x768.png'},
    {width:390,height:844,name:'warmup_start_390x844.png'},
  ];
  for(const size of sizes){
    await page.setViewportSize({width:size.width,height:size.height});
    const say=page.locator('.warmup-say');
    const tag=page.locator('.warmup-tag');
    await expect(say).toBeVisible();
    await expect(tag).toBeVisible();
    const fit=await page.evaluate(()=>{
      const main=document.getElementById('app-main');
      const sayEl=document.querySelector('.warmup-say');
      const tagEl=document.querySelector('.warmup-tag');
      const sr=sayEl.getBoundingClientRect();
      const tr=tagEl.getBoundingClientRect();
      const mr=main.getBoundingClientRect();
      return {
        overflow:main.scrollWidth>main.clientWidth+1,
        sayIn:sr.top>=mr.top-1&&sr.bottom<=mr.bottom+1&&sr.height>8,
        tagIn:tr.top>=mr.top-1&&tr.bottom<=mr.bottom+1&&tr.height>8,
        red:getComputedStyle(tagEl).backgroundColor==='rgb(254, 242, 242)',
      };
    });
    expect(fit.overflow,size.name).toBe(false);
    expect(fit.sayIn,size.name).toBe(true);
    expect(fit.tagIn,size.name).toBe(true);
    expect(fit.red,size.name).toBe(false);
    await page.screenshot({path:ART+'/'+size.name});
  }
  await page.setViewportSize({width:768,height:1024});
  await page.emulateMedia({reducedMotion:'reduce'});
  await state(page,()=>render());
  const motion=await page.locator('.warmup-tag').evaluate(el=>({
    name:getComputedStyle(el).animationName,
    say:getComputedStyle(document.querySelector('.warmup-say')).animationName,
  }));
  expect(motion.name).toBe('none');
  expect(motion.say).toBe('none');
  expect(errors).toEqual([]);
});

test('a reload after the third warm-up answer still says Back to it once',async({page})=>{
  const errors=await boot(page);
  for(let i=0;i<3;i++)await missTier(page,2,i);
  await nextQuestion(page);
  await state(page,()=>{Math.random=()=>0.99;});
  for(let i=0;i<2;i++){
    await answer(page,true);
    await page.click('#nxt');
  }
  expect(await state(page,()=>!!(st.q&&st.q.warmup))).toBe(true);
  await answer(page,true);
  expect(await state(page,()=>st.backPending)).toBe(true);
  await expect(page.locator('.warmup-back')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.warmup-back')).toContainText('Back to it!');
  await expect(page.locator('.warmup-back')).toHaveCount(1);
  expect(await state(page,()=>SAVE_V)).toBe(1);
  await page.reload();
  await expect(page.locator('.warmup-back')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Back to it fits the tablet',async({page})=>{
  const errors=await boot(page);
  for(let i=0;i<3;i++)await missTier(page,2,i);
  await nextQuestion(page);
  await state(page,()=>{Math.random=()=>0.99;});
  for(let i=0;i<3;i++){
    await answer(page,true);
    await page.click('#nxt');
  }
  await page.setViewportSize({width:768,height:1024});
  await state(page,()=>{st.armAt=0;render();});
  const back=page.locator('.warmup-back');
  await expect(back).toContainText('Back to it!');
  await expect(page.locator('.warmup-tag')).toHaveCount(0);
  const fit=await page.evaluate(()=>{
    const main=document.getElementById('app-main');
    const el=document.querySelector('.warmup-back');
    const r=el.getBoundingClientRect();
    const mr=main.getBoundingClientRect();
    return {overflow:main.scrollWidth>main.clientWidth+1,in:r.top>=mr.top-1&&r.bottom<=mr.bottom+1};
  });
  expect(fit.overflow).toBe(false);
  expect(fit.in).toBe(true);
  // The empty streak stand-in must not sit above the bubble. A normal
  // question still keeps that 24px row so the card does not jump later.
  const gap=await page.evaluate(()=>{
    const card=document.querySelector('#game .qcard');
    const back=document.querySelector('.warmup-back');
    const before=getComputedStyle(card,'::before');
    const gone=before.content==='none'||before.height==='0px';
    return {
      beforeH:gone?0:parseFloat(before.height),
      gap:back.getBoundingClientRect().top-card.getBoundingClientRect().top,
    };
  });
  expect(gap.beforeH).toBe(0);
  expect(gap.gap).toBeLessThan(16);
  fs.mkdirSync(ART,{recursive:true});
  await page.screenshot({path:ART+'/warmup_back_768x1024.png'});
  await state(page,()=>{st.q.back=false;st.streak=0;render();});
  const reserved=await page.evaluate(()=>{
    const card=document.querySelector('#game .qcard');
    const before=getComputedStyle(card,'::before');
    const head=document.querySelector('#game .q-head');
    return {h:parseFloat(before.height),head:!!head};
  });
  // The round dots are the reserved row now, still 24px, so a later streak does not jump the card.
  expect(reserved.head).toBe(true);
  const headH=await page.locator('#game .q-head').evaluate(el=>el.getBoundingClientRect().height);
  expect(headH).toBeGreaterThanOrEqual(23);
  expect(headH).toBeLessThanOrEqual(25);
  expect(reserved.h).toBe(0);
  expect(errors).toEqual([]);
});
