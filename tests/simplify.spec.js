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

test('before an answer there are four controls, and the card has at most one tag',async({page})=>{
  const controls=await state(page,playControls);
  expect(controls.length).toBeLessThanOrEqual(4);
  expect(controls).toEqual(expect.arrayContaining(['mute-btn','who-btn','subj-btn','help-btn']));
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
  await expect(page.locator('.verdict')).toHaveAttribute('aria-live','polite');
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
  await expect(page.locator('.verdict')).toHaveAttribute('aria-live','polite');
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
  await expect(page.locator('.verdict')).toHaveAttribute('aria-live','polite');
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
