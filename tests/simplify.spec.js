// The question screen stays a short path: trainer, subject, the Pokémon,
// the question, the answers, and Ask for help. Extras live on the Pokédex.
// A miss still lets the child try again, so Next appears only once the
// question is finished (correct, or the wild Pokémon fled).
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer}=require('./helpers');

let errors;
test.beforeEach(async({page})=>{
  errors=await openGame(page);
  await startGame(page);
});
test.afterEach(()=>expect(errors,'uncaught page errors').toEqual([]));

async function tapParentAnswer(page,text){
  for(const d of String(text))await page.locator(`[data-parent-digit="${d}"]`).click();
}
async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  expect(m,'parent check should be a multiplication').not.toBeNull();
  const a=Number(m[1]),b=Number(m[2]);
  expect(a*b).toBeGreaterThan(100);
  await tapParentAnswer(page,String(a*b));
  await page.click('#parent-go');
}

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

function readScreen(){
  function channel(c){
    c/=255;
    return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
  }
  function lum(rgb){
    return 0.2126*channel(rgb[0])+0.7152*channel(rgb[1])+0.0722*channel(rgb[2]);
  }
  function parse(c){
    const m=String(c).match(/rgba?\(([^)]+)\)/);
    if(!m)return null;
    const p=m[1].split(',').map(s=>parseFloat(s));
    return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};
  }
  function backdrop(el){
    const layers=[];
    let e=el;
    while(e){
      const c=parse(getComputedStyle(e).backgroundColor);
      if(c&&c.a>0)layers.push(c);
      if(c&&c.a>=1)break;
      e=e.parentElement;
    }
    let out=[255,255,255];
    for(let i=layers.length-1;i>=0;i--){
      const c=layers[i];
      out=[c.r*c.a+out[0]*(1-c.a),c.g*c.a+out[1]*(1-c.a),c.b*c.a+out[2]*(1-c.a)];
    }
    return out;
  }
  function shown(el){
    if(!el||el.hidden)return false;
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0;
  }
  const root=document.querySelector('#game');
  const extra=document.querySelector('#mute-btn');
  const nodes=[];
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let n;
  while((n=walker.nextNode())){
    if(!n.textContent||!n.textContent.trim())continue;
    const el=n.parentElement;
    if(!el||!shown(el))continue;
    nodes.push(el);
  }
  if(extra&&shown(extra)){
    extra.querySelectorAll('*').forEach(el=>{if(el.textContent&&el.textContent.trim()&&shown(el))nodes.push(el);});
    nodes.push(extra);
  }
  const seen=new Set();
  const small=[];
  const faint=[];
  let qtext=0,answer=0;
  for(const el of nodes){
    if(seen.has(el))continue;
    seen.add(el);
    const s=getComputedStyle(el);
    const size=parseFloat(s.fontSize);
    const sample=(el.textContent||'').trim().slice(0,40);
    if(el.closest('.qtext'))qtext=Math.max(qtext,size);
    if(el.closest('.ans-btn'))answer=Math.max(answer,size);
    if(size<14)small.push({sample,size,cls:el.className});
    const fg=parse(s.color);
    if(!fg)continue;
    const bg=backdrop(el);
    const blended=[fg.r*fg.a+bg[0]*(1-fg.a),fg.g*fg.a+bg[1]*(1-fg.a),fg.b*fg.a+bg[2]*(1-fg.a)];
    const L1=lum(blended),L2=lum(bg);
    const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    if(ratio<4.5)faint.push({sample,ratio:+ratio.toFixed(2),color:s.color,cls:el.className});
  }
  return {qtext,answer,small,faint};
}

test('before an answer there are four controls, and five when switching is available',async({page})=>{
  const controls=await state(page,playControls);
  expect(controls.length).toBeLessThanOrEqual(4);
  expect(controls).toEqual(expect.arrayContaining(['mute-btn','who-btn','subj-btn','help-btn']));
  expect(controls).not.toContain('mon-switch');
  await state(page,()=>{st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});render();});
  const switching=await state(page,playControls);
  expect(switching.length).toBe(controls.length+1);
  expect(switching.length).toBeLessThanOrEqual(5);
  expect(switching).toEqual(expect.arrayContaining(['mute-btn','who-btn','subj-btn','help-btn','mon-switch']));
  await expect(page.locator('#game .hdr')).not.toContainText('Pokémon');
  await expect(page.locator('#game')).not.toContainText("What's your name?");
  await expect(page.locator('#game .pnum, #game .xp-row, #game .badge-row, #game .candy-btn, #game .great-note, #game #switch-btn')).toHaveCount(0);
  await expect(page.locator('#game .mon-strip .xp-track')).toBeVisible();
  await expect(page.locator('#game .qcard .subj-tag, #game .qcard .best-pill, #game .qcard .shiny-pill, #game .qcard .rematch-pill')).toHaveCount(0);
  await expect(page.locator('.gym-invite')).toHaveCount(0);
  await expect(page.locator('.nxt-btn')).toHaveCount(0);

  await state(page,()=>{st.streak=2;st.bestStreak=9;st.q.rematch=true;render();});
  await expect(page.locator('#game .qcard .q-head')).toHaveCount(0);

  await state(page,()=>{st.streak=3;render();});
  await expect(page.locator('#game .qcard .q-head > *')).toHaveCount(1);
  await expect(page.locator('#game .streak-pill')).toContainText('3 in a row');
});

test('a right answer and a wrong answer each say so with an icon',async({page})=>{
  await answer(page,false);
  const wrong=page.locator('.ans-btn.wrg');
  await expect(wrong).toContainText('✗');
  await expect(page.locator('.verdict')).toHaveText(/Not quite/);
  await expect(page.locator('.verdict')).toContainText('✗');
  await expect(page.locator('#answer-live')).toHaveAttribute('aria-live','polite');
  await expect(page.locator('#answer-live')).toContainText('Not quite');
  await expect(page.locator('.nxt-btn')).toHaveCount(0);
  await expect(page.locator('.gym-invite')).toHaveCount(0);

  await state(page,()=>{
    st.tries=0;st.wrong=[];st.cor=false;st.helped=false;st.armAt=0;
    st.stats.math.level=1;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    const t=st.q.tmpl;
    st.review.push({sub:t.sub,lv:t.lv,idx:t.idx,wins:0,due:0});
    st.q.rematch=true;
    st.streak=4;
    st.streakMsg=null;
    st.rematchMsg=null;
  });
  await answer(page,true);
  const right=page.locator('.ans-btn.cor');
  await expect(right).toContainText('✓');
  await expect(page.locator('.verdict')).toHaveText(/Correct!/);
  await expect(page.locator('.verdict')).toContainText('✓');
  await expect(page.locator('#answer-live')).toContainText('Correct!');
  await expect(page.locator('.xp-earn')).toContainText('XP');
  await expect(page.locator('.nxt-btn')).toHaveCount(1);
  const wide=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('#game button')].filter(el=>{
      if(el.closest('.ans-grid, .numpad, #bottom-nav'))return false;
      const card=document.querySelector('.qcard');
      if(!card)return false;
      const pad=parseFloat(getComputedStyle(card).paddingLeft)+parseFloat(getComputedStyle(card).paddingRight);
      const inner=card.getBoundingClientRect().width-pad;
      return el.getBoundingClientRect().width>=inner*0.9;
    });
    return buttons.map(el=>el.id);
  });
  expect(wide).toEqual(['nxt']);
  await expect(page.locator('.gym-invite')).toBeVisible();
  await expect(page.locator('.prize-line')).toHaveCount(1);
  await expect(page.locator('.prize-line')).toContainText('Rematch won');
  await expect(page.locator('.prize-line')).toContainText('in a row');
});

test('a number-pad miss and a number-pad hit say so with an icon',async({page})=>{
  const found=await state(page,()=>{
    let hit=null;
    for(const lv of Object.keys(QB.math)){
      for(let i=0;i<QB.math[lv].length;i++){
        if(isTypedQuestion(serveQuestion('math',+lv,i,questionPname()))){hit={lv:+lv,i};break;}
      }
      if(hit)break;
    }
    st.phase='play';st.subject='math';
    const deck=QUEUES.math[hit.lv];
    const at=deck.indexOf(hit.i);if(at>=0)deck.splice(at,1);
    st.q=serveQuestion('math',hit.lv,hit.i,questionPname());
    st.cor=false;st.tries=0;st.wrong=[];st.helped=false;st.armAt=0;st.draft='';st.wildEscape=false;
    render();
    return hit;
  });
  expect(found).not.toBeNull();
  await expect(page.locator('.numpad')).toBeVisible();
  await state(page,()=>{
    st.armAt=0;
    const right=st.q.answers[st.q.correctIndex];
    submitTyped(right==='0'?'1':'0');
  });
  await expect(page.locator('#pad-read')).toContainText('✗');
  await expect(page.locator('.verdict')).toContainText('Not quite');
  await expect(page.locator('#answer-live')).toContainText('Not quite');
  await expect(page.locator('.nxt-btn')).toHaveCount(0);
  await state(page,()=>{st.armAt=0;submitTyped(st.q.answers[st.q.correctIndex]);});
  await expect(page.locator('#pad-read')).toContainText('✓');
  await expect(page.locator('.verdict')).toContainText('Correct!');
  await expect(page.locator('.nxt-btn')).toHaveCount(1);
});

test('on a tablet the question, the answers, and the other words stay readable',async({page})=>{
  await page.setViewportSize({width:768,height:1024});
  await state(page,()=>render());
  const open=await state(page,readScreen);
  expect(open.qtext).toBeGreaterThanOrEqual(22);
  expect(open.answer).toBeGreaterThanOrEqual(20);
  expect(open.small).toEqual([]);
  expect(open.faint).toEqual([]);

  await answer(page,false);
  const missed=await state(page,readScreen);
  expect(missed.small).toEqual([]);
  expect(missed.faint).toEqual([]);

  await answer(page,true);
  const solved=await state(page,readScreen);
  expect(solved.qtext).toBeGreaterThanOrEqual(22);
  expect(solved.small).toEqual([]);
  expect(solved.faint).toEqual([]);

  await state(page,()=>{st.anim='';render();});
  const pic=await page.locator('#game .mon-strip img').boundingBox();
  expect(pic.height).toBeGreaterThanOrEqual(90);
  expect(pic.height).toBeLessThanOrEqual(100);
});

test('badges, candy, Switch, and the Great Ball note live on the Pokédex',async({page})=>{
  await state(page,()=>{
    st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
    st.badges.math=[1];
    st.items.candy=1;
    st.items.great=1;
    st.phase='play';
    render();
  });
  await expect(page.locator('#game .badge-row, #game #candy-btn, #game .great-note, #game #switch-btn')).toHaveCount(0);
  await page.click('#nav-pdx');
  await expect(page.locator('#pokedex-page .badge-row')).toBeVisible();
  await expect(page.locator('#pokedex-page #candy-btn')).toBeVisible();
  await expect(page.locator('#pokedex-page #switch-btn')).toBeVisible();
  await expect(page.locator('#pokedex-page .great-note')).toHaveText('Great Ball ready');
});

test('thinking time stays off until a parent turns it on, and that choice sticks',async({page})=>{
  await state(page,()=>{
    st.stats.math.level=3;
    st.badges.math=st.badges.math.filter(t=>t<3);
    st.gymOffer.math={tier:3,cool:0};
    st.cor=true;
    render();
  });
  await page.click('[data-gym-start="math"]');
  await expect(page.locator('#gym-time')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('pkq-gym-timer'))).not.toBe('1');

  await page.click('#nav-pdx');
  await page.click('#parents-link');
  await passParentGate(page);
  await expect(page.locator('#gym-timer-toggle')).toHaveText('Off');
  await page.click('#gym-timer-toggle');
  await expect(page.locator('#gym-timer-toggle')).toHaveText('On');
  expect(await page.evaluate(()=>localStorage.getItem('pkq-gym-timer'))).toBe('1');

  await page.reload();
  await expect(page.locator('#gym-time')).toBeVisible();
  await page.click('#nav-pdx');
  await page.click('#parents-link');
  await passParentGate(page);
  await expect(page.locator('#gym-timer-toggle')).toHaveText('On');
  await page.click('#gym-timer-toggle');
  await expect(page.locator('#gym-timer-toggle')).toHaveText('Off');

  await page.reload();
  await expect(page.locator('#gym-time')).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('pkq-gym-timer'))).toBe('0');
});

async function showChoices(page){
  await state(page,()=>{
    st.phase='play';
    st.subject='reading';
    st.q=serveQuestion('reading',1,0,questionPname());
    st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
    render();
  });
  await expect(page.locator('.ans-btn').first()).toBeVisible();
}

test('on a small phone the question stays at least 18px and at least as big as an answer',async({page})=>{
  await showChoices(page);
  const sizes=[
    {width:375,height:667},
    {width:320,height:568},
    {width:320,height:700},
    {width:568,height:320},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    const fonts=await page.evaluate(()=>{
      const q=parseFloat(getComputedStyle(document.querySelector('.qtext')).fontSize);
      const a=Math.max(...[...document.querySelectorAll('.ans-btn')].map(el=>parseFloat(getComputedStyle(el).fontSize)));
      return {q,a};
    });
    expect(fonts.q,`${size.width}x${size.height} question`).toBeGreaterThanOrEqual(18);
    expect(fonts.q,`${size.width}x${size.height} question vs answer`).toBeGreaterThanOrEqual(fonts.a);
  }
});

test('Ask for help is a full-size tap with readable words',async({page})=>{
  await showChoices(page);
  const sizes=[
    {width:768,height:1024},
    {width:375,height:667},
    {width:320,height:568},
    {width:568,height:320},
  ];
  for(const size of sizes){
    await page.setViewportSize(size);
    const help=page.locator('#help-btn');
    const box=await help.boundingBox();
    const font=await help.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(box.height,`${size.width}x${size.height} height`).toBeGreaterThanOrEqual(44);
    expect(font,`${size.width}x${size.height} text`).toBeGreaterThanOrEqual(14);
  }
});

test('the announcement is one place that stays put when the answer changes',async({page})=>{
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  const handle=await page.locator('#answer-live').elementHandle();
  expect((await page.locator('#answer-live').innerText()).trim()).toBe('');
  await answer(page,false);
  const after=await page.evaluate(el=>({
    same:el===document.getElementById('answer-live')&&el.isConnected,
    text:el.textContent,
    lives:document.querySelectorAll('[aria-live]').length,
  }),handle);
  expect(after.same).toBe(true);
  expect(after.text).toContain('Not quite');
  expect(after.lives).toBe(1);
  await expect(page.locator('#who-btn')).toContainText('Your name?');
});

test('the XP just earned is written on the answer line',async({page})=>{
  await answer(page,false);
  await expect(page.locator('.xp-earn')).toHaveCount(0);
  await state(page,()=>{st.tries=0;st.wrong=[];st.cor=false;st.helped=false;st.armAt=0;});
  await answer(page,true);
  const xp=await state(page,()=>st.lastXp);
  expect(xp).toBeGreaterThan(0);
  await expect(page.locator('.xp-earn')).toHaveText(`+${xp} XP`);
  await expect(page.locator('#answer-live')).toContainText(`+${xp} XP`);
});

test('a wild Pokémon that gets away shows a check on the right answer',async({page})=>{
  await state(page,()=>{
    st.cor=true;
    triggerWildEncounter(false);
    st.q=serveQuestion('reading',1,0,questionPname());
    st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
    st.phase='wild';
    st.wild.misses=CATCH_MISSES_ALLOWED;
    render();
  });
  const ans=await state(page,()=>st.q.answers[st.q.correctIndex]);
  await answer(page,false);
  expect(await state(page,()=>st.wildEscape)).toBe(true);
  await expect(page.locator('.ans-btn.cor')).toContainText('✓');
  await expect(page.locator('.result-msg')).toContainText(`It got away! The answer was ${ans}`);
  await expect(page.locator('#answer-live')).toContainText(`The answer was ${ans}`);
});
