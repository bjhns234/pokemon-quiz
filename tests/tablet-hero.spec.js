// On a tablet the partner is a centered hero while he answers.
// Phones keep the short strip. Wild, Gym, catch, and evolution art stay put.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

const TABLETS=[
  {width:768,height:1024,hero:200},
  {width:1024,height:768,hero:null},
];

const PHONES=[
  {width:375,height:667,img:96},
  {width:320,height:568,img:44},
  {width:667,height:375,img:48},
  {width:568,height:320,img:28},
];

async function show(page,spec){
  await state(page,spec=>{
    const pi=PKM.findIndex(p=>p.n==='Meowscarada');
    if(spec.longName){st.team[0].pi=pi;st.activeIdx=0;}
    st.phase='play';
    st.subject=spec.sub;
    st.team=st.team.slice(0,1);
    st.pendingEvo=null;
    st.q=serveQuestion(spec.sub,spec.lv,spec.idx,questionPname());
    st.tries=0;st.cor=false;st.wrong=[];st.helped=false;st.armAt=0;st.wildEscape=false;st.draft='';
    render();
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
  const help=document.getElementById('help-btn').getBoundingClientRect();
  const check=document.querySelector('[data-pad="check"]');
  const answers=[...document.querySelectorAll('.ans-btn')].map(el=>el.getBoundingClientRect());
  const cs=getComputedStyle(img);
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
  return {
    img:{w:ir.width,h:ir.height,x:ir.x,y:ir.y},
    name:{x:name.x,y:name.y,w:name.width,h:name.height},
    xp:{x:xp.x,y:xp.y,w:xp.width,h:xp.height},
    qTop:q.top,
    helpBottom:help.bottom,
    checkBottom:check?check.getBoundingClientRect().bottom:null,
    answerBottoms:answers.map(r=>r.bottom),
    navTop:nav.top,
    scroll:main.scrollHeight-main.clientHeight,
    scrollTop:main.scrollTop,
    winScroll:window.scrollY,
    src:img.getAttribute('src'),
    rendering:cs.imageRendering,
    short,
    small,
  };
}

test('a tablet shows the partner as a hero and the question does not scroll',async({page})=>{
  test.setTimeout(60000);
  await openGame(page);
  await startGame(page,'math');
  const cases=[
    {sub:'reading',lv:1,idx:0,longName:false,kind:'mc'},
    {sub:'science',lv:3,idx:42,longName:true,kind:'mc'},
    {sub:'math',lv:4,idx:60,longName:true,kind:'typed'},
  ];
  for(const size of TABLETS){
    await page.setViewportSize(size);
    for(const spec of cases){
      await show(page,spec);
      const box=await state(page,layout);
      const where=`${spec.kind} at ${size.width}x${size.height}`;
      if(size.hero){
        expect(box.img.w,where).toBeGreaterThanOrEqual(size.hero-0.5);
        expect(box.img.w,where).toBeLessThanOrEqual(size.hero+0.5);
        expect(box.img.h,where).toBeGreaterThanOrEqual(size.hero-0.5);
        expect(box.img.h,where).toBeLessThanOrEqual(size.hero+0.5);
      }else{
        expect(box.img.w,where).toBeGreaterThanOrEqual(140);
        expect(box.img.h,where).toBeGreaterThanOrEqual(140);
        expect(box.img.w,where).toBeLessThanOrEqual(200.5);
        expect(box.img.h,where).toBeLessThanOrEqual(200.5);
      }
      expect(Math.abs(box.img.w-box.img.h),where).toBeLessThanOrEqual(1);
      expect(box.name.y,`${where} name is beside the picture`).toBeGreaterThanOrEqual(box.img.y+box.img.h-1);
      expect(box.xp.y,`${where} XP bar`).toBeGreaterThanOrEqual(box.name.y+box.name.h-1);
      const mid=box.img.x+box.img.w/2;
      expect(Math.abs(mid-(box.name.x+box.name.w/2)),`${where} name`).toBeLessThanOrEqual(4);
      expect(Math.abs(mid-(box.xp.x+box.xp.w/2)),`${where} XP bar`).toBeLessThanOrEqual(4);
      expect(box.src,where).toContain('/official-artwork/');
      expect(box.rendering,where).not.toMatch(/pixelated|crisp-edges/);
      expect(box.scroll,`${where} scrolls`).toBeLessThanOrEqual(1);
      expect(box.scrollTop,where).toBe(0);
      expect(box.winScroll,where).toBe(0);
      expect(box.qTop,where).toBeGreaterThanOrEqual(0);
      expect(box.helpBottom,`${where} Ask for help`).toBeLessThanOrEqual(box.navTop+0.5);
      if(spec.kind==='typed'){
        expect(box.checkBottom,`${where} Check`).not.toBeNull();
        expect(box.checkBottom,`${where} Check`).toBeLessThanOrEqual(box.navTop+0.5);
      }else{
        expect(box.answerBottoms,where).toHaveLength(4);
        for(const bottom of box.answerBottoms){
          expect(bottom,`${where} answer`).toBeLessThanOrEqual(box.navTop+0.5);
        }
      }
      expect(box.short,`${where} tap targets`).toEqual([]);
      expect(box.small,`${where} text`).toEqual([]);
    }
  }
});

test('phone strips and wild or Gym art keep their sizes',async({page})=>{
  await openGame(page);
  await startGame(page,'reading');
  for(const size of PHONES){
    await page.setViewportSize(size);
    await show(page,{sub:'reading',lv:1,idx:0,longName:false});
    const img=await page.locator('#game .mon-strip img').boundingBox();
    expect(img.width,`${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.img-0.5);
    expect(img.width,`${size.width}x${size.height}`).toBeLessThanOrEqual(size.img+0.5);
    expect(img.height,`${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.img-0.5);
    expect(img.height,`${size.width}x${size.height}`).toBeLessThanOrEqual(size.img+0.5);
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
      const catchW=parseFloat(getComputedStyle(document.querySelector('#catch-pkm img')).width);
      const evoW=parseFloat(getComputedStyle(document.querySelector('#evo-sprite-wrap img')).width);
      return {wild,gym,catchW,evoW};
    });
    expect(measured.wild,`wild at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.wild-0.5);
    expect(measured.wild,`wild at ${size.width}x${size.height}`).toBeLessThanOrEqual(size.wild+0.5);
    expect(measured.gym,`gym at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.gym-0.5);
    expect(measured.gym,`gym at ${size.width}x${size.height}`).toBeLessThanOrEqual(size.gym+0.5);
    expect(measured.catchW).toBeGreaterThanOrEqual(179);
    expect(measured.evoW).toBeGreaterThanOrEqual(199);
  }
});
