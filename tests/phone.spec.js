// Short phones: the sound button stays in the header row, and the buttons
// a child actually taps are at least 44px tall.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,serve}=require('./helpers');

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

test('Switch Pokémon stays on the Pokédex, and the picker stays easy to read',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  await state(page,()=>{
    st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
    render();
  });
  await expect(page.locator('#game #switch-btn')).toHaveCount(0);
  await page.click('#nav-pdx');
  const btn=page.locator('#pokedex-page #switch-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('Switch Pokémon');
  await expect(btn).not.toContainText(/Switch \d/);
  await page.click('#switch-btn');
  await expect(page.locator('#switch-cancel')).toContainText('Never mind');
  for(const size of SIZES){
    await page.setViewportSize(size);
    await toTop(page);
    await expectTall(page,'#switch-cancel',size);
    const fonts=await page.locator('.switch-opt-name').evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));
    expect(fonts.length,`picker names at ${size.width}x${size.height}`).toBeGreaterThan(0);
    for(const font of fonts){
      expect(font,`picker name at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(14);
    }
    const outNow=await page.locator('.switch-opt-out').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(outNow,`OUT NOW at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(14);
  }
});

async function expectSwitchClear(page,size){
  const box=await page.locator('#mon-switch').boundingBox();
  expect(box,`strip at ${size.width}x${size.height}`).toBeTruthy();
  expect(box.height,`strip height at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(44);
  expect(box.width,`strip width at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(44);
  await expectMuteClear(page,size);
  const hits=await page.evaluate(()=>{
    const el=document.getElementById('mon-switch');
    const mb=el.getBoundingClientRect();
    function shown(node){
      if(!node||node===el||el.contains(node)||node.contains(el))return false;
      const s=getComputedStyle(node);
      if(s.display==='none'||s.visibility==='hidden')return false;
      const r=node.getBoundingClientRect();
      return r.width>2&&r.height>2;
    }
    function hit(r){
      const w=Math.min(mb.right,r.right)-Math.max(mb.left,r.left);
      const h=Math.min(mb.bottom,r.bottom)-Math.max(mb.top,r.top);
      return w>0.5&&h>0.5;
    }
    const bad=[];
    for(const node of document.querySelectorAll('button,a,input,select,textarea')){
      if(!shown(node))continue;
      if(hit(node.getBoundingClientRect()))bad.push(node.id||String(node.className).slice(0,48));
    }
    return bad;
  });
  expect(hits,`strip overlaps at ${size.width}x${size.height}: ${hits.join(', ')}`).toEqual([]);
}

test('tapping the Pokémon on the Game tab opens the picker',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  await state(page,()=>{
    st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
    render();
  });
  const strip=page.locator('#mon-switch');
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute('aria-label','Switch Pokémon');
  await expect(strip.locator('.switch-mark')).toBeVisible();
  const mark=await strip.locator('.switch-mark').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(mark).toBeGreaterThanOrEqual(14);
  await expect(page.locator('#game #switch-btn')).toHaveCount(0);
  strip.focus();
  const ring=await strip.evaluate(el=>{
    const s=getComputedStyle(el);
    return {style:s.outlineStyle,width:parseFloat(s.outlineWidth)};
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThanOrEqual(2);
  for(const size of SIZES){
    await page.setViewportSize(size);
    await toTop(page);
    await expectSwitchClear(page,size);
    const corner=await strip.locator('.switch-mark').evaluate(el=>{
      const m=el.getBoundingClientRect();
      const img=el.parentElement.querySelector('img').getBoundingClientRect();
      return {
        font:parseFloat(getComputedStyle(el).fontSize),
        leftOfCenter:m.left+m.width/2<img.left+img.width*0.55,
        belowMiddle:m.top+m.height/2>img.top+img.height*0.45,
      };
    });
    expect(corner.font,`badge text at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(14);
    expect(corner.leftOfCenter,`badge covers the face at ${size.width}x${size.height}`).toBe(true);
    expect(corner.belowMiddle,`badge covers the face at ${size.width}x${size.height}`).toBe(true);
  }
  await page.setViewportSize({width:375,height:667});
  await page.click('#mon-switch');
  await expect(page.getByText('Choose your Pokémon!')).toBeVisible();
  await page.click('#switch-cancel');
  await answer(page,true);
  await expect(page.locator('#mon-switch')).toBeVisible();
  await expect(page.locator('#mon-switch')).toHaveAttribute('aria-label','Switch Pokémon');
});

test('one Pokémon does not turn the strip into a button',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  const strip=page.locator('#game .mon-strip');
  await expect(strip).toBeVisible();
  await expect(page.locator('#mon-switch')).toHaveCount(0);
  await expect(strip.locator('.switch-mark')).toHaveCount(0);
  const quiet=await strip.evaluate(el=>({
    tag:el.tagName,
    role:el.getAttribute('role'),
    tab:el.tabIndex,
    cursor:getComputedStyle(el).cursor,
  }));
  expect(quiet).toEqual({tag:'DIV',role:null,tab:-1,cursor:'default'});
  await strip.click();
  await expect(page.getByText('Choose your Pokémon!')).toHaveCount(0);
  expect(await state(page,()=>st.phase)).toBe('play');
  expect(await state(page,()=>canOfferSwitch())).toBe(false);

  await state(page,()=>{
    st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
    st.pendingEvo={fromPi:st.team[0].pi,toPi:st.team[0].pi+1};
    render();
  });
  await expect(page.locator('#mon-switch')).toHaveCount(0);
  expect(await state(page,()=>canOfferSwitch())).toBe(false);
  await page.click('#nav-pdx');
  await expect(page.locator('#switch-btn')).toHaveCount(0);

  await page.click('#nav-game');
  await state(page,()=>{
    st.pendingEvo=null;
    st.cor=true;
    triggerWildEncounter(false);
    render();
  });
  await expect(page.locator('#mon-switch, #game .mon-strip')).toHaveCount(0);
  expect(await state(page,()=>canOfferSwitch())).toBe(false);

  await state(page,()=>{
    st.phase='gym';
    st.wild=null;
    st.award=null;
    st.gym={sub:'math',tier:1,queue:[0],qi:0,kid:4,lead:5,solved:false,over:null};
    st.q=serveQuestion('math',1,0,questionPname());
    render();
  });
  await expect(page.locator('#mon-switch, #game .mon-strip')).toHaveCount(0);

  await state(page,()=>{
    st.phase='award';
    st.gym=null;
    st.award={again:true,sub:'math',tier:1,xp:0,candy:0,great:0,grew:false,partner:null};
    render();
  });
  await expect(page.locator('#mon-switch, #game .mon-strip')).toHaveCount(0);
  await expect(page.locator('.award-card')).toBeVisible();
});

test('switching from the Game tab keeps the same question',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  await state(page,()=>{st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});});
  await serve(page,{sub:'reading'});
  await answer(page,false);
  const before=await state(page,()=>({text:st.q.question,key:reviewKey(st.q.tmpl),wrong:[...st.wrong]}));
  const [oldName,newName]=await state(page,()=>[PKM[st.team[0].pi].n,PKM[st.team[1].pi].n]);
  expect(before.text).toContain(oldName);
  await page.click('#mon-switch');
  await expect(page.getByText('Choose your Pokémon!')).toBeVisible();
  await page.click('[data-switch-idx="1"]');
  const after=await state(page,()=>({text:st.q.question,key:reviewKey(st.q.tmpl),wrong:[...st.wrong],phase:st.phase}));
  expect(after.phase).toBe('play');
  expect(after.key).toBe(before.key);
  expect(after.wrong).toEqual(before.wrong);
  expect(after.text).toBe(before.text.split(oldName).join(newName));
  await expect(page.locator('#mon-switch')).toBeVisible();
});

test('a long answer scrolls Next above the bar',async({page})=>{
  test.setTimeout(120000);
  await openGame(page);
  await startGame(page,'reading');
  await page.setViewportSize({width:568,height:320});
  const cases=await state(page,()=>{
    const named=[
      {sub:'science',lv:3,idx:26},
      {sub:'science',lv:3,idx:33},
      {sub:'science',lv:3,idx:42},
      {sub:'reading',lv:3,idx:12},
      {sub:'reading',lv:3,idx:41},
    ];
    let longest=null;
    for(const sub of Object.keys(QB)){
      for(const lv of Object.keys(QB[sub])){
        QB[sub][lv].forEach((q,idx)=>{
          const n=String(q[0]).length;
          if(!longest||n>longest.n)longest={sub,lv:+lv,idx,n};
        });
      }
    }
    const all=named.slice();
    if(!named.some(c=>c.sub===longest.sub&&c.lv===longest.lv&&c.idx===longest.idx))all.push(longest);
    return all;
  });
  async function deal(two,spec){
    await state(page,({two,spec})=>{
      if(two){
        if(st.team.length<2)st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
      }else{
        st.team=st.team.slice(0,1);
        st.activeIdx=0;
      }
      st.pendingEvo=null;
      st.phase='play';st.subject=spec.sub;
      st.q=serveQuestion(spec.sub,spec.lv,spec.idx,questionPname());
      st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
      st.lastXp=0;st.streakMsg='';st.rematchMsg='';
      render();
      document.getElementById('app-main').scrollTop=0;
    },{two,spec});
  }
  async function nextInView(label){
    await expect.poll(async()=>page.evaluate(()=>{
      const nxt=document.getElementById('nxt');
      const nav=document.getElementById('bottom-nav');
      const main=document.getElementById('app-main');
      if(!nxt)return false;
      const t=nxt.getBoundingClientRect();
      const n=nav.getBoundingClientRect();
      const m=main.getBoundingClientRect();
      return t.height>=44&&t.top>=m.top-0.5&&t.bottom<=n.top+0.5;
    }),{timeout:4000,message:label}).toBe(true);
  }
  await deal(false,cases[0]);
  const look=await page.evaluate(()=>{
    const btn=document.querySelector('.ans-btn');
    const cols=getComputedStyle(document.querySelector('.ans-grid')).gridTemplateColumns.split(' ').filter(Boolean).length;
    return {font:parseFloat(getComputedStyle(btn).fontSize),h:btn.getBoundingClientRect().height,cols};
  });
  expect(look.font).toBeGreaterThanOrEqual(18);
  expect(look.h).toBeGreaterThanOrEqual(44);
  expect(look.cols).toBe(2);
  for(const two of [false,true]){
    for(const spec of cases){
      const who=`${two?'2 Pokémon':'1 Pokémon'} ${spec.sub} ${spec.lv} #${spec.idx}`;
      await deal(two,spec);
      await state(page,()=>{st.armAt=0;handleAnswer(st.q.correctIndex);});
      await nextInView(`${who}, correct`);
      await expect(page.locator('#answer-live')).toContainText('Correct');
      expect(await page.evaluate(()=>document.activeElement&&document.activeElement.id)).not.toBe('nxt');
      await deal(two,spec);
      await state(page,()=>{
        st.armAt=0;
        const miss=st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex);
        handleAnswer(miss);
        st.armAt=0;
        handleAnswer(st.q.correctIndex);
      });
      await nextInView(`${who}, after a miss`);
      await expect(page.locator('#answer-live')).toContainText('Correct');
      expect(await page.evaluate(()=>document.activeElement&&document.activeElement.id)).not.toBe('nxt');
    }
  }
});

test('Next does not scroll when it already fits',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  await page.setViewportSize({width:568,height:320});
  await state(page,()=>{
    st.team=st.team.slice(0,1);
    st.activeIdx=0;
    st.pendingEvo=null;
    st.phase='play';st.subject='reading';
    st.q=serveQuestion('reading',1,0,questionPname());
    st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
    render();
    document.getElementById('app-main').scrollTop=0;
  });
  const moved=await state(page,()=>{
    const main=document.getElementById('app-main');
    const before=main.scrollTop;
    st.armAt=0;
    handleAnswer(st.q.correctIndex);
    return {before,after:main.scrollTop};
  });
  await page.evaluate(()=>new Promise(r=>setTimeout(r,500)));
  const after=await page.evaluate(()=>document.getElementById('app-main').scrollTop);
  expect(moved.before).toBe(0);
  expect(moved.after).toBe(0);
  expect(after).toBe(0);
  const clear=await page.evaluate(()=>{
    const t=document.getElementById('nxt').getBoundingClientRect();
    const n=document.getElementById('bottom-nav').getBoundingClientRect();
    return t.bottom<=n.top+0.5;
  });
  expect(clear).toBe(true);
});

test('reduced motion brings Next into view without a smooth scroll',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await openGame(page);
  await startGame(page,'science');
  await page.setViewportSize({width:568,height:320});
  await state(page,()=>{
    if(st.team.length<2)st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
    st.pendingEvo=null;
    st.phase='play';st.subject='science';
    st.q=serveQuestion('science',3,42,questionPname());
    st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
    render();
    document.getElementById('app-main').scrollTop=0;
  });
  const jumped=await state(page,()=>{
    const main=document.getElementById('app-main');
    const before=main.scrollTop;
    st.armAt=0;
    handleAnswer(st.q.correctIndex);
    const nxt=document.getElementById('nxt').getBoundingClientRect();
    const nav=document.getElementById('bottom-nav').getBoundingClientRect();
    const live=document.getElementById('answer-live').textContent;
    return {
      before,
      after:main.scrollTop,
      visible:nxt.bottom<=nav.top+0.5&&nxt.top>=0,
      focus:document.activeElement&&document.activeElement.id,
      live,
    };
  });
  expect(jumped.after).toBeGreaterThan(jumped.before);
  expect(jumped.visible).toBe(true);
  expect(jumped.focus).not.toBe('nxt');
  expect(jumped.live).toContain('Correct');
});

test('long questions keep the answers and Ask for help above the bar',async({page})=>{
  test.setTimeout(120000);
  await openGame(page);
  await startGame(page,'reading');
  await page.setViewportSize({width:568,height:320});
  const picked=await state(page,()=>{
    const name=PKM.reduce((a,p)=>p.n.length>a.length?p.n:a,'');
    const all=[];
    for(const sub of Object.keys(QB)){
      for(const lv of Object.keys(QB[sub])){
        QB[sub][lv].forEach((raw,idx)=>{
          if(!raw[1]||!Array.isArray(raw[1]))return;
          const probe={subject:sub,tmpl:{lv:+lv,raw},answers:raw[1]};
          if(isTypedQuestion(probe))return;
          all.push({
            sub,lv:+lv,idx,
            stem:String(raw[0]).length,
            ans:Math.max(...raw[1].map(a=>String(a).length)),
          });
        });
      }
    }
    const byStem=[...all].sort((a,b)=>b.stem-a.stem||b.ans-a.ans).slice(0,4);
    const byAns=[...all].sort((a,b)=>b.ans-a.ans||b.stem-a.stem).slice(0,4);
    const named=[{sub:'science',lv:3,idx:26},{sub:'science',lv:3,idx:33}];
    const seen=new Set();
    const cases=[];
    for(const c of [...byStem,...byAns,...named]){
      const k=c.sub+':'+c.lv+':'+c.idx;
      if(seen.has(k))continue;
      seen.add(k);
      cases.push({sub:c.sub,lv:c.lv,idx:c.idx});
    }
    return {name,cases};
  });
  for(const two of [false,true]){
    for(const spec of picked.cases){
      const fit=await state(page,({two,spec,name})=>{
        if(two){
          if(st.team.length<2)st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
        }else{
          st.team=st.team.slice(0,1);
          st.activeIdx=0;
        }
        st.pendingEvo=null;
        st.phase='play';st.subject=spec.sub;
        const raw=QB[spec.sub][spec.lv][spec.idx];
        st.q=fillQuestion({sub:spec.sub,lv:spec.lv,idx:spec.idx,raw,order:[0,1,2,3],cheer:raw[3]},name);
        st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
        const main=document.getElementById('app-main');
        main.scrollTop=0;
        render();
        const nav=document.getElementById('bottom-nav').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.ans-btn')];
        const help=document.getElementById('help-btn').getBoundingClientRect();
        const strip=document.querySelector('#mon-switch, #game .mon-strip');
        return {
          scroll:main.scrollTop,
          font:parseFloat(getComputedStyle(buttons[0]).fontSize),
          ans:buttons.map(el=>{
            const r=el.getBoundingClientRect();
            return {bottom:r.bottom,h:r.height};
          }),
          helpBottom:help.bottom,
          navTop:nav.top,
          stripH:strip?strip.getBoundingClientRect().height:0,
        };
      },{two,spec,name:picked.name});
      const who=`${two?'2 Pokémon':'1 Pokémon'} ${spec.sub} ${spec.lv} #${spec.idx}`;
      expect(fit.scroll,`${who} scrolled before an answer`).toBe(0);
      expect(fit.font,who).toBeGreaterThanOrEqual(18);
      expect(fit.ans,who).toHaveLength(4);
      for(const a of fit.ans){
        expect(a.h,who).toBeGreaterThanOrEqual(44);
        expect(a.bottom,`${who} answer is under the bar`).toBeLessThanOrEqual(fit.navTop+0.5);
      }
      expect(fit.helpBottom,`${who} Ask for help is under the bar`).toBeLessThanOrEqual(fit.navTop+0.5);
      if(two)expect(fit.stripH,who).toBeGreaterThanOrEqual(44);
    }
  }
});

test('Next fits above the bar without scrolling on the other small screens',async({page})=>{
  test.setTimeout(120000);
  await openGame(page);
  await startGame(page,'reading');
  async function deal(two){
    await state(page,two=>{
      if(two){
        if(st.team.length<2)st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
      }else{
        st.team=st.team.slice(0,1);
        st.activeIdx=0;
      }
      st.pendingEvo=null;
      st.phase='play';st.subject='reading';
      st.q=serveQuestion('reading',1,0,questionPname());
      st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
      render();
    },two);
  }
  async function expectNextClear(size,label){
    await toTop(page);
    const gap=await page.evaluate(()=>{
      const nxt=document.getElementById('nxt').getBoundingClientRect();
      const nav=document.getElementById('bottom-nav').getBoundingClientRect();
      return {below:nxt.bottom-nav.top,scroll:document.getElementById('app-main').scrollTop};
    });
    expect(gap.scroll,`${label} scrolled at ${size.width}x${size.height}`).toBe(0);
    expect(gap.below,`${label} Next is under the bar at ${size.width}x${size.height}`).toBeLessThanOrEqual(0.5);
  }
  const sizes=SIZES.filter(size=>!(size.width===568&&size.height===320));
  for(const size of sizes){
    await page.setViewportSize(size);
    for(const two of [false,true]){
      const who=two?'2 Pokémon':'1 Pokémon';
      await deal(two);
      await state(page,()=>{st.armAt=0;handleAnswer(st.q.correctIndex);});
      await expect(page.locator('#nxt')).toBeVisible();
      await expectNextClear(size,`${who}, correct`);
      await deal(two);
      await state(page,()=>{
        st.armAt=0;
        const miss=st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex);
        handleAnswer(miss);
        st.armAt=0;
        handleAnswer(st.q.correctIndex);
      });
      await expect(page.locator('#nxt')).toBeVisible();
      await expectNextClear(size,`${who}, after a miss`);
    }
  }
});

test('the Pokédex top row stays on one line on a narrow phone',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  await page.click('#nav-pdx');
  await expect(page.locator('#pokedex-page .hdr')).toBeVisible();
  for(const width of [320,375]){
    await page.setViewportSize({width,height:568});
    await toTop(page);
    const row=await page.evaluate(()=>{
      const hdr=document.querySelector('#pokedex-page .hdr');
      const bits=[...hdr.children].filter(el=>el.getBoundingClientRect().height>2);
      const tops=bits.map(el=>el.getBoundingClientRect().top);
      const bottoms=bits.map(el=>el.getBoundingClientRect().bottom);
      return {oneRow:Math.max(...tops)<Math.min(...bottoms),height:hdr.getBoundingClientRect().height};
    });
    expect(row.oneRow,`Pokédex header wraps at ${width}px`).toBe(true);
    expect(row.height,`Pokédex header height at ${width}px`).toBeLessThan(60);
    const reset=await page.locator('#reset-btn').evaluate(el=>({
      text:el.innerText.replace(/\s+/g,' ').trim(),
      sw:el.scrollWidth,
      cw:el.clientWidth,
    }));
    expect(reset.text,`reset label at ${width}px`).toBe('Hold to reset');
    expect(reset.sw,`reset label clipped at ${width}px`).toBeLessThanOrEqual(reset.cw+1);
  }
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
