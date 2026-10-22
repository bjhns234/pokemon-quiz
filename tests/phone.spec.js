// Short phones: the sound button stays in the header row, and the buttons
// a child actually taps are at least 44px tall.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

const SIZES=[
  {width:667,height:375},
  {width:568,height:320},
  {width:320,height:568},
  {width:375,height:667},
  {width:768,height:1024}, // iPad Mini
];

async function toTop(page){
  await page.evaluate(()=>{
    window.scrollTo(0,0);
    const main=document.getElementById('app-main');
    if(main)main.scrollTop=0;
  });
}

async function showReading(page){
  await state(page,()=>{
    st.phase='play';
    st.subject='reading';
    st.q=serveQuestion('reading',1,0,questionPname());
    st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
    render();
  });
  await expect(page.locator('.ans-btn').first()).toBeVisible();
}

async function showTyped(page){
  const found=await state(page,()=>{
    for(const lv of Object.keys(QB.math)){
      for(let i=0;i<QB.math[lv].length;i++){
        const q=serveQuestion('math',+lv,i,questionPname());
        if(isTypedQuestion(q)){
          st.phase='play';st.subject='math';
          st.q=q;st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
          render();
          return true;
        }
      }
    }
    return false;
  });
  expect(found).toBe(true);
  await expect(page.locator('#game .pad-key').first()).toBeVisible();
}

async function expectTall(page,selector,size){
  const loc=page.locator(selector);
  const n=await loc.count();
  let seen=0;
  for(let i=0;i<n;i++){
    const box=await loc.nth(i).boundingBox();
    if(!box||box.height<2)continue;
    seen++;
    expect(box.height,`${selector} at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(44);
  }
  expect(seen,`${selector} at ${size.width}x${size.height}`).toBeGreaterThan(0);
}

// The sound button's box must miss the question, every card, and every other control.
async function expectMuteClear(page,size){
  const hits=await page.evaluate(()=>{
    const mute=document.getElementById('mute-btn');
    const mb=mute.getBoundingClientRect();
    function shown(el){
      if(!el||el===mute||mute.contains(el)||el.contains(mute))return false;
      const s=getComputedStyle(el);
      if(s.display==='none'||s.visibility==='hidden')return false;
      const r=el.getBoundingClientRect();
      return r.width>2&&r.height>2;
    }
    function hit(r){
      const w=Math.min(mb.right,r.right)-Math.max(mb.left,r.left);
      const h=Math.min(mb.bottom,r.bottom)-Math.max(mb.top,r.top);
      return w>0.5&&h>0.5;
    }
    const bad=[];
    for(const el of document.querySelectorAll('button,a,input,select,textarea')){
      if(!shown(el))continue;
      if(hit(el.getBoundingClientRect()))bad.push(el.id||String(el.className).slice(0,48));
    }
    for(const el of document.querySelectorAll('.qtext,.card')){
      if(!shown(el))continue;
      if(hit(el.getBoundingClientRect()))bad.push(String(el.className).slice(0,48)||el.tagName);
    }
    return bad;
  });
  expect(hits,`sound overlaps at ${size.width}x${size.height}: ${hits.join(', ')}`).toEqual([]);
}

test('trainer, subject, answers, and Next stay 44px, and sound stays clear',async({page})=>{
  test.setTimeout(120000);
  await openGame(page);
  await startGame(page,'reading');
  for(const size of SIZES){
    await page.setViewportSize(size);
    await showReading(page);
    await toTop(page);
    await expectTall(page,'#who-btn',size);
    await expectTall(page,'#subj-btn',size);
    await expectTall(page,'.ans-btn',size);
    await expectMuteClear(page,size);
    if(size.width===375||size.width===320){
      await expect(page.locator('#who-btn')).toContainText('Your name?');
      const overflow=await page.locator('#who-btn span').evaluate(el=>el.scrollWidth-el.clientWidth);
      expect(overflow,`Your name? at ${size.width}px`).toBeLessThanOrEqual(1);
    }
    await state(page,()=>{st.armAt=0;handleAnswer(st.q.correctIndex);});
    await toTop(page);
    await expectTall(page,'#nxt',size);
    await expectMuteClear(page,size);
  }

  await showTyped(page);
  for(const size of SIZES){
    await page.setViewportSize(size);
    await toTop(page);
    await expectTall(page,'#game .pad-key',size);
    await expectMuteClear(page,size);
  }

  await page.setViewportSize({width:768,height:1024});
  await page.click('#nav-pdx');
  await page.click('#parents-link');
  await expect(page.locator('#parent-back')).toBeVisible();
  for(const size of SIZES){
    await page.setViewportSize(size);
    await toTop(page);
    await expectMuteClear(page,size);
    const back=await page.locator('#parent-back').boundingBox();
    expect(back.height,`Back at ${size.width}x${size.height}`).toBeGreaterThan(20);
  }
});

test('each wrong answer is its own announcement',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  await showReading(page);
  await expect(page.locator('#answer-live')).toHaveText('');
  const first=await page.evaluate(()=>{
    st.armAt=0;
    const i=st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex);
    handleAnswer(i);
    return document.getElementById('answer-live').textContent;
  });
  const second=await page.evaluate(()=>{
    st.armAt=0;
    const i=st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex&&!st.wrong.includes(j));
    handleAnswer(i);
    return document.getElementById('answer-live').textContent;
  });
  expect(first).toBe('✗ Not quite (try 1)');
  expect(second).toBe('✗ Not quite (try 2)');
  expect(second).not.toBe(first);
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(page.locator('.verdict')).toContainText('Not quite');
  await expect(page.locator('.verdict')).not.toContainText('try');
});

test('counting captions stay 14px on a short phone',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    for(const lv of Object.keys(QB.math)){
      const idx=QB.math[lv].findIndex(q=>q[0].includes('6 + 7'));
      if(idx<0)continue;
      st.phase='play';st.subject='math';
      st.q=serveQuestion('math',+lv,idx,questionPname());
      st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;
      render();
      return;
    }
  });
  await page.setViewportSize({width:568,height:320});
  await page.click('#help-btn');
  await expect(page.locator('.hv-cap').first()).toBeVisible();
  const font=await page.locator('.hv-cap').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(font).toBeGreaterThanOrEqual(14);
});
