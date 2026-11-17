// On a tablet the partner is a centered hero that takes the leftover height.
// Phones keep the short strip. Wild, Gym, catch, and evolution art stay put.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

const PHONES=[
  {width:375,height:667,img:96},
  {width:320,height:568,img:44},
  {width:667,height:375,img:48},
  {width:568,height:320,img:28},
];

// Heights the hero has to survive: the 700px floor, a short iPad, the old
// 820px seam, and a tall portrait.
const TABLETS=[
  {width:800,height:700,safe:21},
  {width:1024,height:700,safe:21},
  {width:1133,height:744,safe:21},
  {width:1024,height:768,safe:0},
  {width:1024,height:768,safe:21},
  {width:1180,height:820,safe:21},
  {width:1024,height:821,safe:0},
  {width:1194,height:834,safe:21},
  {width:1024,height:900,safe:0},
  {width:1024,height:910,safe:0},
  {width:820,height:1180,safe:0},
  {width:834,height:1194,safe:0},
  {width:768,height:1024,safe:0},
  {width:768,height:1024,safe:21},
  {width:1366,height:1024,safe:0},
];

async function show(page,spec){
  await state(page,spec=>{
    const pi=PKM.findIndex(p=>p.n==='Meowscarada');
    if(spec.longName){st.team[0].pi=pi;st.activeIdx=0;}
    st.team=st.team.slice(0,1);
    st.pendingEvo=null;
    st.streak=spec.streak||0;
    st.phase='play';
    st.subject=spec.sub;
    st.q=serveQuestion(spec.sub,spec.lv,spec.idx,questionPname());
    st.tries=spec.tries||0;
    st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;
    st.draft=spec.draft||'';
    render();
    const nav=document.getElementById('bottom-nav');
    nav.style.paddingBottom=(spec.safe||0)+'px';
    document.getElementById('app-main').scrollTop=0;
    window.scrollTo(0,0);
  },spec);
}

function layout(){
  const main=document.getElementById('app-main');
  const nav=document.getElementById('bottom-nav').getBoundingClientRect();
  const img=document.querySelector('#game .mon-strip img');
  const ir=img.getBoundingClientRect();
  const name=document.querySelector('#game .mon-strip .pname').getBoundingClientRect();
  const xp=document.querySelector('#game .mon-strip .xp-track').getBoundingClientRect();
  const q=document.querySelector('.qtext').getBoundingClientRect();
  const help=document.getElementById('help-btn');
  const helpR=help?help.getBoundingClientRect():null;
  const check=document.querySelector('[data-pad="check"]');
  const checkR=check?check.getBoundingClientRect():null;
  const answers=[...document.querySelectorAll('.ans-btn')].map(el=>el.getBoundingClientRect());
  const cs=getComputedStyle(img);
  const checkCol=check?getComputedStyle(check).gridColumn:'';
  const buttons=[...document.querySelectorAll('#game button, #bottom-nav button, #mute-btn')];
  const short=[];
  for(const el of buttons){
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden')continue;
    const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2)continue;
    if(r.height<44-0.5||r.width<44-0.5)short.push((el.id||el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height));
  }
  const small=[];
  const walker=document.createTreeWalker(document.getElementById('game'),NodeFilter.SHOW_TEXT);
  let node;
  const seen=new Set();
  while((node=walker.nextNode())){
    if(!node.textContent||!node.textContent.trim())continue;
    const el=node.parentElement;
    if(!el||seen.has(el))continue;
    seen.add(el);
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden')continue;
    const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2)continue;
    const size=parseFloat(s.fontSize);
    if(size<14)small.push(node.textContent.trim().slice(0,32)+' '+size);
  }
  const read=document.getElementById('pad-read');
  return {
    img:{w:ir.width,h:ir.height,x:ir.x,y:ir.y},
    name:{x:name.x,y:name.y,w:name.width,h:name.height},
    xp:{x:xp.x,y:xp.y,w:xp.width,h:xp.height},
    qTop:q.top,
    helpBottom:helpR?helpR.bottom:null,
    checkBottom:checkR?checkR.bottom:null,
    checkCol,
    answerBottoms:answers.map(r=>r.bottom),
    navTop:nav.top,
    scroll:main.scrollHeight-main.clientHeight,
    scrollTop:main.scrollTop,
    winScroll:window.scrollY,
    src:img.getAttribute('src'),
    attrW:img.getAttribute('width'),
    rendering:cs.imageRendering,
    short,
    small,
    readClip:read?read.scrollHeight-read.clientHeight:0,
    cols:document.querySelector('#game .numpad')?getComputedStyle(document.querySelector('#game .numpad')).gridTemplateColumns.split(' ').filter(Boolean).length:0,
    keyH:document.querySelector('#game .pad-key:not(.pad-check)')?document.querySelector('#game .pad-key:not(.pad-check)').getBoundingClientRect().height:0,
  };
}

const LONG={sub:'math',lv:4,idx:60,longName:true,kind:'typed'};
const MC={sub:'reading',lv:1,idx:0,longName:false,kind:'mc'};

test('a tablet hero fits the streak, the pad, and the home indicator',async({page})=>{
  test.setTimeout(90000);
  await openGame(page);
  await startGame(page,'math');
  for(const size of TABLETS){
    await page.setViewportSize({width:size.width,height:size.height});
    const where=`${size.width}x${size.height} safe ${size.safe}`;
    await show(page,{...LONG,streak:5,safe:size.safe});
    const typed=await state(page,layout);
    expect(typed.scroll,`${where} scrolls`).toBeLessThanOrEqual(1);
    expect(typed.scrollTop,where).toBe(0);
    expect(typed.img.h,`${where} hero`).toBeGreaterThanOrEqual(120);
    expect(typed.img.h,`${where} hero`).toBeLessThanOrEqual(200.5);
    expect(Math.abs(typed.img.w-typed.img.h),where).toBeLessThanOrEqual(1.5);
    expect(typed.name.y,where).toBeGreaterThanOrEqual(typed.img.y+typed.img.h-1);
    expect(typed.xp.y,where).toBeGreaterThanOrEqual(typed.name.y+typed.name.h-1);
    expect(typed.qTop,where).toBeGreaterThanOrEqual(typed.xp.y+typed.xp.h-1);
    expect(typed.helpBottom,`${where} Ask for help`).toBeLessThanOrEqual(typed.navTop+0.5);
    expect(typed.checkBottom,`${where} Check`).toBeLessThanOrEqual(typed.navTop+0.5);
    expect(typed.checkCol,`${where} Check spans the pad`).toContain('1');
    if((size.width===768&&size.height===1024)||(size.width===820&&size.height===1180)){
      expect(typed.cols,`${where} pad columns`).toBe(3);
      expect(typed.keyH,`${where} key height`).toBeGreaterThanOrEqual(57);
    }
    if(size.width===1024&&size.height===768){
      expect(typed.cols,`${where} pad columns`).toBe(4);
    }
    expect(typed.src,where).toContain('/official-artwork/');
    expect(typed.attrW,where).toBe('96');
    expect(typed.rendering,where).not.toMatch(/pixelated|crisp-edges/);
    expect(typed.short,`${where} tap targets`).toEqual([]);
    expect(typed.small,`${where} text`).toEqual([]);

    await show(page,{...LONG,streak:0,safe:size.safe});
    const plain=await state(page,layout);
    expect(Math.abs(plain.img.h-typed.img.h),`${where} streak changes the hero`).toBeLessThanOrEqual(1);
    expect(Math.abs(plain.img.w-typed.img.w),`${where} streak changes the hero`).toBeLessThanOrEqual(1);
    expect(plain.scroll,`${where} without a streak scrolls`).toBeLessThanOrEqual(1);
    expect(plain.helpBottom,`${where} without a streak`).toBeLessThanOrEqual(plain.navTop+0.5);

    if(size.width===1024&&size.height===768&&size.safe===0){
      expect(typed.img.h,`${where} pinned landscape hero`).toBeGreaterThanOrEqual(199);
      expect(typed.img.h,`${where} pinned landscape hero`).toBeLessThanOrEqual(201);
      expect(typed.img.w,`${where} pinned landscape hero`).toBeGreaterThanOrEqual(199);
      expect(typed.img.w,`${where} pinned landscape hero`).toBeLessThanOrEqual(201);
      await page.evaluate(()=>{
        const canvas=document.createElement('canvas');
        canvas.width=475;canvas.height=475;
        const img=document.querySelector('#game .mon-strip img');
        img.src=canvas.toDataURL('image/png');
      });
      await page.waitForFunction(()=>document.querySelector('#game .mon-strip img').naturalWidth===475);
      const loaded=await state(page,layout);
      expect(loaded.img.h,`${where} loaded art`).toBeGreaterThanOrEqual(199);
      expect(loaded.img.h,`${where} loaded art`).toBeLessThanOrEqual(201);
      expect(loaded.scroll,`${where} loaded art scrolls`).toBeLessThanOrEqual(1);
      expect(loaded.helpBottom,`${where} loaded art help`).toBeLessThanOrEqual(loaded.navTop+0.5);
    }

    await show(page,{...MC,streak:0,safe:size.safe});
    const mc=await state(page,layout);
    expect(mc.scroll,`${where} MC scrolls`).toBeLessThanOrEqual(1);
    expect(mc.helpBottom,`${where} MC help`).toBeLessThanOrEqual(mc.navTop+0.5);
    expect(mc.img.h,`${where} MC hero`).toBeGreaterThanOrEqual(120);
    expect(mc.img.h,`${where} MC hero`).toBeLessThanOrEqual(200.5);
    for(const bottom of mc.answerBottoms){
      expect(bottom,`${where} answer`).toBeLessThanOrEqual(mc.navTop+0.5);
    }
    if(size.width===768&&size.height===1024&&size.safe===0){
      const hug=await page.evaluate(()=>{
        const strip=document.querySelector('#game .mon-strip');
        const xp=strip.querySelector('.xp-track').getBoundingClientRect();
        const box=strip.getBoundingClientRect();
        return {below:box.bottom-xp.bottom,pad:parseFloat(getComputedStyle(strip).paddingTop)};
      });
      expect(Math.abs(hug.below-hug.pad),`${where} card hugs the XP bar`).toBeLessThanOrEqual(2);
      expect(plain.img.h,`${where} portrait hero`).toBeGreaterThanOrEqual(199);
      expect(plain.img.h,`${where} portrait hero`).toBeLessThanOrEqual(201);
      const mark=await state(page,()=>{
        if(st.team.length<2)st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
        st.pendingEvo=null;
        render();
        const box=document.querySelector('#game .switch-mark').getBoundingClientRect();
        return {w:box.width,h:box.height};
      });
      expect(mark.w,`${where} switch badge`).toBeGreaterThanOrEqual(27);
      expect(mark.h,`${where} switch badge`).toBeGreaterThanOrEqual(27);
    }
  }
});

test('a missed answer keeps its hint above the bar',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  const sizes=[
    {width:1024,height:768,safe:0},
    {width:1024,height:768,safe:21},
    {width:768,height:1024,safe:0},
    {width:1133,height:744,safe:21},
    {width:1194,height:834,safe:0},
    {width:800,height:700,safe:21},
  ];
  for(const size of sizes){
    await page.setViewportSize({width:size.width,height:size.height});
    const fit=await state(page,size=>{
      document.getElementById('bottom-nav').style.paddingBottom=size.safe+'px';
      let hit=null;
      for(const lv of Object.keys(QB.math)){
        for(let i=0;i<QB.math[lv].length&&!hit;i++){
          const q=serveQuestion('math',+lv,i,questionPname());
          if(mathVisualSpec(q))hit={lv:+lv,idx:i};
        }
      }
      st.streak=5;
      st.phase='play';st.subject='math';
      st.q=serveQuestion('math',hit.lv,hit.idx,questionPname());
      st.tries=1;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.draft='1';st.wildEscape=false;
      render();
      const main=document.getElementById('app-main');
      const nav=document.getElementById('bottom-nav').getBoundingClientRect();
      const hint=document.querySelector('.hint-visual');
      const msg=document.querySelector('.result-msg');
      const bottom=Math.max(hint?hint.getBoundingClientRect().bottom:0,msg?msg.getBoundingClientRect().bottom:0);
      return {scroll:main.scrollHeight-main.clientHeight,under:bottom-nav.top,hasHint:!!hint};
    },size);
    const where=`${size.width}x${size.height} safe ${size.safe}`;
    expect(fit.hasHint,where).toBe(true);
    expect(fit.scroll,`${where} scrolls`).toBeLessThanOrEqual(1);
    expect(fit.under,`${where} hint`).toBeLessThanOrEqual(0.5);
  }
});

test('a missed typed answer does not clip the readout',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  await page.setViewportSize({width:1024,height:768});
  await show(page,{...LONG,streak:5,tries:1,draft:'12'});
  const box=await state(page,layout);
  expect(box.readClip).toBeLessThanOrEqual(1);
  const read=await page.locator('#pad-read').boundingBox();
  expect(read.height).toBeGreaterThanOrEqual(40);
  await page.setViewportSize({width:1194,height:834});
  await show(page,{...LONG,streak:5,tries:1,draft:'12'});
  const tall=await state(page,layout);
  expect(tall.readClip).toBeLessThanOrEqual(1);
});

test('phone strips keep their sizes, and catch and evolution stay full size when shown',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  for(const size of PHONES){
    await page.setViewportSize(size);
    await show(page,{...MC,safe:0});
    const img=page.locator('#game .mon-strip img');
    const box=await img.boundingBox();
    expect(box.width,`${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.img-0.5);
    expect(box.width,`${size.width}x${size.height}`).toBeLessThanOrEqual(size.img+0.5);
    expect(box.height,`${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.img-0.5);
    expect(box.height,`${size.width}x${size.height}`).toBeLessThanOrEqual(size.img+0.5);
    expect(await img.getAttribute('width')).toBe('96');
    expect(await img.getAttribute('height')).toBe('96');
  }
  const scenes=[
    {width:768,height:1024,wild:140,gym:120},
    {width:1024,height:768,wild:80,gym:80},
  ];
  for(const size of scenes){
    await page.setViewportSize(size);
    const measured=await state(page,()=>{
      st.phase='wild';
      st.wild={pi:LINES[1][0],level:5,shiny:false,correctStreak:0,misses:0};
      st.q=serveQuestion('math',1,0,PKM[LINES[1][0]].n);
      st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;
      render();
      const wild=document.querySelector('.wild-card .psvg img').getBoundingClientRect().height;
      st.phase='gym';
      st.wild=null;
      st.gym={sub:'math',tier:1,queue:[0],qi:0,kid:4,lead:5,solved:false,over:null};
      st.q=serveQuestion('math',1,0,questionPname());
      render();
      const gym=document.querySelector('.gym-card .psvg img').getBoundingClientRect().height;
      const catchOv=document.getElementById('catch-overlay');
      const catchImg=document.getElementById('catch-pkm-img');
      catchImg.style.cssText='';
      catchOv.classList.add('active');
      const catchBox=catchImg.getBoundingClientRect();
      const evoOv=document.getElementById('evo-overlay');
      const evoImg=document.getElementById('evo-img');
      evoImg.style.cssText='';
      evoOv.classList.add('active');
      const evoBox=evoImg.getBoundingClientRect();
      catchOv.classList.remove('active');
      evoOv.classList.remove('active');
      return {
        wild,gym,
        catchH:catchBox.height,catchShown:catchBox.width>2&&catchOv.classList.contains('active')===false?catchBox.top>=0:catchBox.top,
        evoH:evoBox.height,
      };
    });
    expect(measured.wild,`wild at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.wild-0.5);
    expect(measured.wild,`wild at ${size.width}x${size.height}`).toBeLessThanOrEqual(size.wild+0.5);
    expect(measured.gym,`gym at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.gym-0.5);
    expect(measured.gym,`gym at ${size.width}x${size.height}`).toBeLessThanOrEqual(size.gym+0.5);
    expect(measured.catchH,`catch at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(179);
    expect(measured.catchH,`catch at ${size.width}x${size.height}`).toBeLessThanOrEqual(181);
    expect(measured.evoH,`evolution at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(199);
    expect(measured.evoH,`evolution at ${size.width}x${size.height}`).toBeLessThanOrEqual(201);
  }
});
