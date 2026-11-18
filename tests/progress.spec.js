// Parent progress report. The log is optional on old saves (SAVE_V stays 1).
// A right answer after a hint counts as an attempt and never as right.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,serve}=require('./helpers');

// Wednesday. Nov 16 is Monday and Nov 15 is Sunday, matching the report mockup.
const TODAY=new Date(2026,10,18,12,0,0);

function kidSave(name,id,data){
  return {
    v:1,roster:1,activeId:id,
    kids:[{
      id,name,avatar:'#025',
      data:Object.assign({
        v:1,starter:0,activeIdx:0,
        team:[{num:'#025',level:8,xp:10}],
        dex:['#025'],
        subject:'math',
        stats:{
          math:{cor:20,att:24,level:3,cs:0,ws:0},
          reading:{cor:0,att:0,level:1,cs:0,ws:0},
          science:{cor:0,att:0,level:1,cs:0,ws:0},
        },
        badges:{math:[1,2],reading:[],science:[]},
        settings:{grade:'auto'},
      },data),
    }],
  };
}

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  expect(m,'parent check should be a multiplication').not.toBeNull();
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

async function openSeeded(page,data,{time=TODAY,name='Simon',id='simon'}={}){
  await page.clock.install({time});
  const errors=await openGame(page,{save:kidSave(name,id,data)});
  await openParents(page);
  return errors;
}

test('a seeded log shows Solid, Practicing, and New',async({page})=>{
  // 18/20 Adding over two days, 7/10 Subtracting, 3 Counting tries.
  // All three days are inside the last 7, so the column matches the status.
  const errors=await openSeeded(page,{
    log:{
      '2026-11-18':{
        'math|Adding|3':[10,10,0],
        'math|Subtracting|3':[4,6,0],
      },
      '2026-11-17':{
        'math|Adding|3':[8,10,0],
        'math|Subtracting|3':[3,4,0],
        'math|Counting|3':[2,3,0],
      },
    },
  });
  const card=page.locator('[data-progress-for="simon"]');
  await expect(card).toBeVisible();
  const adding=card.locator('[data-skill="Adding"][data-tier="3"]:not([data-review="1"])');
  await expect(adding).toContainText('18 / 20');
  await expect(adding.locator('.prog-chip')).toHaveText('Solid');
  await expect(adding).toContainText('2nd grade');
  const sub=card.locator('[data-skill="Subtracting"][data-tier="3"]:not([data-review="1"])');
  await expect(sub).toContainText('7 / 10');
  await expect(sub.locator('.prog-chip')).toHaveText('Practicing');
  const counting=card.locator('[data-skill="Counting"][data-tier="3"]:not([data-review="1"])');
  await expect(counting).toContainText('2 / 3');
  await expect(counting.locator('.prog-chip')).toHaveText('New');
  await expect(card.locator('.prog-foot')).toContainText('Solid');
  await expect(card.locator('.prog-foot')).toContainText('Practicing');
  await expect(card.locator('.prog-foot')).toContainText('New');
  expect(errors).toEqual([]);
});

test('review mix is marked review and a rematch does not change the numbers',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{st.stats.math.level=3;});
  await serve(page,{sub:'math',lv:2,idx:1});
  expect(await state(page,()=>questionTopic('math',st.q.tmpl.raw[0]))).toBe('Subtracting');
  await state(page,()=>{st.q.bankReview=true;});
  await answer(page,true);
  const afterReview=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log);
  const today=await page.evaluate(()=>{
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  });
  expect(afterReview[today]['math|Subtracting|2|review']).toEqual([1,1,0]);
  expect(afterReview[today]['math|@|2']).toBeUndefined();
  expect(afterReview[today]['math|@|3']).toBeUndefined();

  await serve(page,{sub:'math',lv:3,idx:4});
  expect(await state(page,()=>questionTopic('math',st.q.tmpl.raw[0]))).toBe('Adding');
  await answer(page,true);
  const beforeRematch=await page.evaluate(()=>JSON.parse(JSON.stringify(JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log)));

  await serve(page,{sub:'math',lv:3,idx:4});
  await state(page,()=>{st.q.rematch=true;});
  await answer(page,true);
  const afterRematch=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log);
  expect(afterRematch).toEqual(beforeRematch);

  await openParents(page);
  const review=page.locator('[data-progress-for] [data-skill="Subtracting"][data-tier="2"][data-review="1"]');
  await expect(review).toContainText('1 / 1');
  await expect(review).toContainText('1st grade · review');
  const adding=page.locator('[data-progress-for] [data-skill="Adding"][data-tier="3"][data-review="0"]');
  await expect(adding).toContainText('1 / 1');
  expect(errors).toEqual([]);
});

test('a right answer after a hint counts as an attempt and not as right',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await serve(page,{sub:'math',lv:1,idx:0});
  await state(page,()=>askForHelp());
  await answer(page,true);
  const today=await page.evaluate(()=>{
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  });
  const log=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log);
  expect(log[today]['math|Adding|1']).toEqual([0,1,1]);
  expect(log[today]['math|@|1']).toBe('0');
  await openParents(page);
  const row=page.locator('[data-progress-for] [data-skill="Adding"][data-tier="1"][data-review="0"]');
  await expect(row).toContainText('0 / 1');
  await expect(row.locator('.prog-chip')).toHaveText('New');
  expect(errors).toEqual([]);
});

test('a gym answer counts on the skill and not in the eligible tape',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await serve(page,{sub:'math',lv:1,idx:0});
  await state(page,()=>{st.phase='gym';});
  await answer(page,true);
  const log=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log);
  const today=await page.evaluate(()=>{
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  });
  expect(log[today]['math|Adding|1|gym']).toEqual([1,1,0]);
  expect(log[today]['math|Adding|1']).toBeUndefined();
  expect(log[today]['math|@|1']).toBeUndefined();
  await openParents(page);
  const row=page.locator('[data-progress-for] [data-skill="Adding"][data-tier="1"][data-review="0"]');
  await expect(row).toContainText('1 / 1');
  await expect(row).not.toContainText('review');
  expect(errors).toEqual([]);
});

test('a hidden subject is stored on the log and left off the card',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  const topic=await state(page,()=>questionTopic('reading',QB.reading[1][0][0]));
  await serve(page,{sub:'reading',lv:1,idx:0});
  await answer(page,true);
  const log=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log);
  const blob=JSON.stringify(log);
  expect(blob).toContain('reading|'+topic+'|1');
  await openParents(page);
  await expect(page.locator('[data-progress-for]')).not.toContainText(topic);
  expect(errors).toEqual([]);
});

test('a day older than 30 days is dropped on the next save',async({page})=>{
  await page.clock.install({time:TODAY});
  const errors=await openGame(page,{save:kidSave('Simon','simon',{
    log:{
      '2026-10-18':{'math|Money|4':[1,1,0]},
      '2026-10-19':{'math|Adding|3':[2,2,0]},
      '2026-11-18':{'math|Adding|3':[1,1,0]},
      '2026-12-01':{'math|Shapes|3':[3,4,0],'math|@|3':'100'},
    },
  })});
  await state(page,()=>save());
  const log=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids[0].data.log);
  expect(log['2026-10-18']).toBeUndefined();
  expect(log['2026-12-01']).toBeUndefined();
  expect(log['2026-10-19']['math|Adding|3']).toEqual([2,2,0]);
  expect(log['2026-11-18']['math|Adding|3']).toEqual([1,1,0]);
  expect(log['2026-11-18']['math|Shapes|3']).toEqual([3,4,0]);
  expect(log['2026-11-18']['math|@|3']).toBe('100');
  expect(errors).toEqual([]);
});

test('only the last 7 days fill the column and the last 14 decide the status',async({page})=>{
  // Nov 10 is 8 days before Nov 18: inside 14, outside 7.
  // Oct 18 is 31 days back and must not create a Money row.
  const errors=await openSeeded(page,{
    log:{
      '2026-11-18':{'math|Adding|3':[1,1,0]},
      '2026-11-10':{'math|Adding|3':[9,9,0]},
      '2026-10-18':{'math|Money|4':[5,5,0]},
    },
  });
  const adding=page.locator('[data-progress-for="simon"] [data-skill="Adding"][data-tier="3"]');
  await expect(adding).toContainText('1 / 1');
  await expect(adding.locator('.prog-chip')).toHaveText('Solid');
  await expect(page.locator('[data-skill="Money"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an old save with no log shows every skill as New and says tracking started',async({page})=>{
  const errors=await openSeeded(page,{});
  const card=page.locator('[data-progress-for="simon"]');
  await expect(card.locator('.prog-sub')).toContainText('saved on this iPad only');
  await expect(card.locator('.prog-sub')).toContainText('Tracking started Nov 17');
  const chips=card.locator('.prog-chip');
  const n=await chips.count();
  expect(n).toBeGreaterThan(0);
  for(let i=0;i<n;i++)await expect(chips.nth(i)).toHaveText('New');
  await expect(card.locator('.prog-when').first()).toContainText('Not yet');
  expect(errors).toEqual([]);
});

test('the tracking note is gone once seven days have passed',async({page})=>{
  const errors=await openSeeded(page,{},{time:new Date(2026,10,24,12,0,0)});
  const card=page.locator('[data-progress-for="simon"]');
  await expect(card.locator('.prog-sub')).toContainText('saved on this iPad only');
  await expect(card.locator('.prog-sub')).not.toContainText('Tracking started');
  await expect(card.locator('.prog-chip').first()).toHaveText('New');
  expect(errors).toEqual([]);
});

test('a child who has not played yet has no skill table',async({page})=>{
  await page.clock.install({time:TODAY});
  const simon=kidSave('Simon','simon',{}).kids[0];
  const errors=await openGame(page,{save:{
    v:1,roster:1,activeId:null,
    kids:[{id:'pip',name:'Pip',avatar:'#004',data:null},simon],
  }});
  await openParents(page);
  const pip=page.locator('[data-progress-for="pip"]');
  await expect(pip).toContainText("Hasn't started playing yet");
  await expect(pip.locator('.prog-row')).toHaveCount(0);
  await expect(page.locator('[data-kid-name="Pip"]')).toContainText("Hasn't started playing yet");
  expect(errors).toEqual([]);
});

function eightRowLog(){
  // Six 2nd-grade bank topics, one extra skill, and one review row. No "Not yet"
  // leftovers, so the card is exactly eight rows.
  return {
    '2026-11-18':{
      'math|Odd and even|3':[4,6,0],
      'math|Subtracting|2|review':[4,6,0],
      'math|Place value|3':[2,3,0],
      'math|Adding|3':[10,10,0],
      'math|Counting|3':[8,8,0],
      'math|Word problems with more than one step|3':[8,8,0],
      'math|Subtracting|3':[8,8,0],
      'math|Shapes|3':[8,8,0],
    },
    '2026-11-17':{
      'math|Odd and even|3':[2,4,0],
      'math|Subtracting|2|review':[3,4,0],
      'math|Adding|3':[8,10,0],
      'math|Counting|3':[6,7,0],
      'math|Word problems with more than one step|3':[6,7,0],
      'math|Subtracting|3':[6,7,0],
      'math|Shapes|3':[6,7,0],
    },
  };
}

test('the gym line reads the last 40 eligible tries, and the top tier says so',async({page})=>{
  const zeros='0'.repeat(20);
  const ones='1'.repeat(30);
  const errors=await openSeeded(page,{
    log:{
      '2026-11-17':{'math|@|3':zeros,'math|Adding|3':[0,20,0]},
      '2026-11-18':{'math|@|3':ones,'math|Adding|3':[30,30,0]},
    },
  });
  const line=await state(page,log=>gymLineText('math',3,log),{
    '2026-11-17':{'math|@|3':zeros,'math|Adding|3':[0,20,0]},
    '2026-11-18':{'math|@|3':ones,'math|Adding|3':[30,30,0]},
  });
  expect(line).toContain('2nd-grade Gym: 75% right over 40 tries on 2 days.');
  expect(line).toContain('Opens at 85% (needs 30+ tries on 2+ days).');
  expect(errors).toEqual([]);
});

test('the top math tier says top level reached',async({page})=>{
  const errors=await openSeeded(page,{
    stats:{
      math:{cor:5,att:5,level:4,cs:0,ws:0},
      reading:{cor:0,att:0,level:1,cs:0,ws:0},
      science:{cor:0,att:0,level:1,cs:0,ws:0},
    },
    log:{'2026-11-18':{'math|@|4':'11111','math|Adding|4':[5,5,0]}},
  });
  const line=await state(page,()=>gymLineText('math',4,{'2026-11-18':{'math|@|4':'11111'}}));
  expect(line).toBe('Top level reached.');
  expect(line).not.toContain('Opens at 85%');
  expect(errors).toEqual([]);
});

test('opening Parents does not request anything except sprites',async({page})=>{
  const stray=[];
  page.on('request',req=>{
    const url=req.url();
    if(url.startsWith('file:')||url.startsWith('data:'))return;
    if(url.startsWith('https://raw.githubusercontent.com/PokeAPI/sprites/'))return;
    stray.push(url);
  });
  const errors=await openSeeded(page,{log:{'2026-11-18':{'math|Adding|3':[1,1,0]}}});
  expect(stray).toEqual([]);
  expect(errors).toEqual([]);
});

test('eight rows fit on a tablet and a phone stacks without sideways scroll',async({page})=>{
  const errors=await openSeeded(page,{log:eightRowLog()});
  const card=page.locator('[data-progress-for="simon"]');
  await expect(card.locator('.prog-row')).toHaveCount(8);
  await expect(card.locator('.prog-more')).toHaveCount(0);
  const chips=await card.locator('.prog-chip').allTextContents();
  const rank={Practicing:0,New:1,Solid:2};
  let prev=-1;
  chips.forEach(t=>{
    expect(rank[t],'status order').toBeGreaterThanOrEqual(prev);
    prev=rank[t];
  });
  expect(chips).toContain('Practicing');
  expect(chips).toContain('New');
  expect(chips).toContain('Solid');

  for(const size of [{width:768,height:1024},{width:1024,height:768}]){
    await page.setViewportSize(size);
    await card.scrollIntoViewIfNeeded();
    const fit=await card.evaluate(el=>{
      const r=el.getBoundingClientRect();
      const row=el.querySelector('.prog-row');
      const box=s=>row.querySelector(s).getBoundingClientRect();
      const skill=box('.prog-skill'),num=box('.prog-num');
      const oneRow=num.left>skill.right-8&&num.top<skill.bottom-4;
      const main=document.getElementById('app-main');
      return {
        h:r.height,top:r.top,bottom:r.bottom,vh:window.innerHeight,oneRow,
        doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        main:main.scrollWidth-main.clientWidth,
      };
    });
    expect(fit.h,`card height at ${size.width}x${size.height}`).toBeLessThanOrEqual(fit.vh+1);
    expect(fit.top,`card top at ${size.width}`).toBeGreaterThanOrEqual(-1);
    expect(fit.bottom,`card bottom at ${size.width}`).toBeLessThanOrEqual(fit.vh+1);
    expect(fit.oneRow,`one row at ${size.width}`).toBe(true);
    expect(fit.doc,`page scroll at ${size.width}`).toBeLessThanOrEqual(1);
    expect(fit.main,`main scroll at ${size.width}`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({width:390,height:844});
  const phone=await card.evaluate(el=>{
    const row=el.querySelector('.prog-row');
    const box=s=>row.querySelector(s).getBoundingClientRect();
    const skill=box('.prog-skill'),status=box('.prog-status'),num=box('.prog-num'),when=box('.prog-when');
    const main=document.getElementById('app-main');
    return {
      stacked:num.top>=skill.bottom-4&&Math.abs(status.top-skill.top)<12&&when.left>num.left,
      doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      main:main.scrollWidth-main.clientWidth,
    };
  });
  expect(phone.stacked).toBe(true);
  expect(phone.doc).toBeLessThanOrEqual(1);
  expect(phone.main).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('progress text stays readable and Show all and Back are at least 44px',async({page})=>{
  const log=eightRowLog();
  log['2026-11-16']={'math|Money|4':[1,3,0]};
  const errors=await openSeeded(page,{log});
  await page.setViewportSize({width:768,height:1024});
  const card=page.locator('[data-progress-for="simon"]');
  await expect(card.locator('.prog-row')).toHaveCount(8);
  const more=card.locator('.prog-more');
  await expect(more).toHaveText('Show all');
  const moreBox=await more.boundingBox();
  const back=await page.locator('#parent-back').boundingBox();
  expect(moreBox.height).toBeGreaterThanOrEqual(44);
  expect(moreBox.width).toBeGreaterThanOrEqual(44);
  expect(back.height).toBeGreaterThanOrEqual(44);
  expect(back.width).toBeGreaterThanOrEqual(44);
  const type=await card.evaluate(el=>{
    const small=[];
    const body=[];
    const seen=new Set();
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      if(!n.textContent||!n.textContent.trim())continue;
      const node=n.parentElement;
      if(!node||seen.has(node))continue;
      seen.add(node);
      const size=parseFloat(getComputedStyle(node).fontSize);
      const sample=(node.textContent||'').trim().slice(0,40);
      if(size<14)small.push({sample,size});
      if(node.classList.contains('prog-skill')||node.classList.contains('prog-num')||node.classList.contains('prog-when')){
        if(size<16)body.push({sample,size});
      }
    }
    return {small,body};
  });
  expect(type.small).toEqual([]);
  expect(type.body).toEqual([]);
  await more.click();
  await expect(card.locator('.prog-row')).toHaveCount(9);
  await expect(card.locator('[data-skill="Money"]')).toContainText('1 / 3');
  expect(errors).toEqual([]);
});

test('status chips say the word and clear 4.5 to 1',async({page})=>{
  const errors=await openSeeded(page,{log:eightRowLog()});
  const contrast=await page.locator('.prog-chip').evaluateAll(els=>{
    function channel(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
    function lum(rgb){return 0.2126*channel(rgb[0])+0.7152*channel(rgb[1])+0.0722*channel(rgb[2]);}
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
    return els.map(el=>{
      const s=getComputedStyle(el);
      const fg=parse(s.color);
      const bg=backdrop(el);
      const blended=[fg.r*fg.a+bg[0]*(1-fg.a),fg.g*fg.a+bg[1]*(1-fg.a),fg.b*fg.a+bg[2]*(1-fg.a)];
      const L1=lum(blended),L2=lum(bg);
      const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      return {word:el.textContent.trim(),ratio:+ratio.toFixed(2)};
    });
  });
  expect([...new Set(contrast.map(c=>c.word))].sort()).toEqual(['New','Practicing','Solid']);
  contrast.forEach(c=>expect(c.ratio,c.word).toBeGreaterThanOrEqual(4.5));
  expect(errors).toEqual([]);
});

function miniData(level,log){
  return {
    v:1,starter:0,activeIdx:0,
    team:[{num:'#025',level:8,xp:1}],
    dex:['#025'],
    subject:'math',
    stats:{
      math:{cor:1,att:1,level,cs:0,ws:0},
      reading:{cor:0,att:0,level:1,cs:0,ws:0},
      science:{cor:0,att:0,level:1,cs:0,ws:0},
    },
    badges:{math:[],reading:[],science:[]},
    settings:{grade:'auto'},
    log,
  };
}

test('the progress table replaces the missed-topics box',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await serve(page,{sub:'math',lv:1,idx:0});
  await answer(page,false);
  await answer(page,true);
  await serve(page,{sub:'math',lv:1,idx:4});
  await state(page,()=>askForHelp());
  await answer(page,true);
  await openParents(page);
  await expect(page.locator('.parent-focus')).toHaveCount(0);
  await expect(page.locator('.parent-miss')).toHaveCount(0);
  const card=page.locator('[data-kid-name="Trainer"]');
  await expect(page.locator('[data-progress-for] .parent-practice')).toContainText('Practice adding.');
  await expect(card).toContainText('Trying these again');
  await expect(card).toContainText('Right after a hint');
  await expect(card).toContainText('1 + 2');
  expect(errors).toEqual([]);
});

test('the footer states the real rules and one perfect day is still Practicing',async({page})=>{
  const errors=await openSeeded(page,{
    log:{'2026-11-18':{'math|Adding|3':[10,10,0]}},
  });
  const card=page.locator('[data-progress-for="simon"]');
  await expect(card.locator('.prog-foot')).toContainText('Numbers show the last 7 days');
  await expect(card.locator('.prog-foot')).toContainText('Solid looks at the last 14');
  const adding=card.locator('[data-skill="Adding"][data-tier="3"]');
  await expect(adding).toContainText('10 / 10');
  await expect(adding.locator('.prog-chip')).toHaveText('Practicing');
  expect(errors).toEqual([]);
});

test('tracking started stays for seven days after the first logged answer',async({page})=>{
  const errors=await openSeeded(page,{
    log:{'2026-11-18':{'math|Adding|3':[4,5,0]}},
  });
  await expect(page.locator('[data-progress-for="simon"] .prog-sub')).toContainText('Tracking started Nov 17');
  const later=await (async()=>{
    const next=await page.context().newPage();
    await next.clock.install({time:new Date(2026,10,24,12,0,0)});
    const err=await openGame(next,{save:kidSave('Simon','simon',{
      log:{'2026-11-18':{'math|Adding|3':[4,5,0]}},
    })});
    if(!(await next.locator('#parents-link').isVisible()))await next.click('#nav-pdx');
    await next.click('#parents-link');
    const q=await next.locator('#parent-q').innerText();
    const m=q.match(/(\d+)\s*times\s*(\d+)/i);
    for(const d of String(Number(m[1])*Number(m[2])))await next.locator(`[data-parent-digit="${d}"]`).click();
    await next.click('#parent-go');
    await expect(next.locator('[data-progress-for="simon"] .prog-sub')).toContainText('saved on this iPad only');
    await expect(next.locator('[data-progress-for="simon"] .prog-sub')).not.toContainText('Tracking started');
    await next.close();
    return err;
  })();
  expect(errors).toEqual([]);
  expect(later).toEqual([]);
});

test('a sibling card folds a future day and drops a day older than 30 without a save',async({page})=>{
  await page.clock.install({time:TODAY});
  const errors=await openGame(page,{save:{
    v:1,roster:1,activeId:null,
    kids:[
      {id:'simon',name:'Simon',avatar:'#025',data:miniData(3,{
        '2026-11-18':{'math|Counting|3':[1,1,0],'math|@|3':'1'},
      })},
      {id:'sam',name:'Sam',avatar:'#004',data:miniData(3,{
        '2026-10-18':{'math|Adding|3':[40,40,0],'math|@|3':'1'.repeat(40)},
        '2026-11-18':{'math|Adding|3':[5,5,0],'math|@|3':'11111'},
        '2026-12-01':{'math|Adding|3':[0,10,0],'math|@|3':'0'.repeat(10)},
      })},
    ],
  }});
  await openParents(page);
  const sam=page.locator('[data-progress-for="sam"]');
  const adding=sam.locator('[data-skill="Adding"][data-tier="3"][data-review="0"]');
  await expect(adding).toContainText('5 / 15');
  await expect(adding.locator('.prog-chip')).toHaveText('Practicing');
  const samLine=await state(page,log=>gymLineText('math',3,log),{
    '2026-10-18':{'math|Adding|3':[40,40,0],'math|@|3':'1'.repeat(40)},
    '2026-11-18':{'math|Adding|3':[5,5,0],'math|@|3':'11111'},
    '2026-12-01':{'math|Adding|3':[0,10,0],'math|@|3':'0'.repeat(10)},
  });
  const simonLine=await state(page,log=>gymLineText('math',3,log),{
    '2026-11-18':{'math|Counting|3':[1,1,0],'math|@|3':'1'},
  });
  expect(samLine).toContain('33% right over 15 tries on 1 day');
  expect(simonLine).toContain('100% right over 1 try');
  const raw=await page.evaluate(()=>JSON.parse(localStorage.getItem('pkq-save')).kids.find(k=>k.id==='sam').data.log);
  expect(raw['2026-10-18']['math|Adding|3']).toEqual([40,40,0]);
  expect(raw['2026-12-01']['math|@|3']).toBe('0'.repeat(10));
  expect(errors).toEqual([]);
});

test('the gym line floors the percent so 85 shows only at 85 percent or more',async({page})=>{
  // 33/39 is 84.6%, which rounds to 85 and floors to 84.
  const errors=await openSeeded(page,{
    log:{'2026-11-18':{'math|@|3':'1'.repeat(33)+'0'.repeat(6),'math|Adding|3':[10,10,0]}},
  });
  const line=await state(page,log=>gymLineText('math',3,log),{'2026-11-18':{'math|@|3':'1'.repeat(33)+'0'.repeat(6),'math|Adding|3':[10,10,0]}});
  expect(line).toContain('84% right over 39 tries on 1 day');
  expect(line).not.toContain('85% right');
  expect(errors).toEqual([]);
});

test('phone rows still announce 7 days and Last played',async({page})=>{
  const errors=await openSeeded(page,{log:{'2026-11-18':{'math|Adding|3':[1,2,0]}}});
  await page.setViewportSize({width:390,height:844});
  const access=await page.locator('.prog-head').evaluate(el=>{
    const s=getComputedStyle(el);
    const r=el.getBoundingClientRect();
    return {display:s.display,visibility:s.visibility,text:el.textContent,h:r.height};
  });
  expect(access.display).not.toBe('none');
  expect(access.visibility).not.toBe('hidden');
  expect(access.text).toContain('7 days');
  expect(access.text).toContain('Last played');
  expect(access.h).toBeLessThan(8);
  const num=await page.locator('.prog-num').first().evaluate(el=>el.textContent);
  const when=await page.locator('.prog-when').first().evaluate(el=>el.textContent);
  expect(num).toContain('7 days');
  expect(when).toContain('Last played');
  expect(errors).toEqual([]);
});

test('Show all keeps the page where it was',async({page})=>{
  const log=eightRowLog();
  log['2026-11-16']={'math|Money|4':[1,3,0]};
  const errors=await openSeeded(page,{log});
  await page.setViewportSize({width:768,height:500});
  await page.evaluate(()=>{document.getElementById('app-main').scrollTop=320;});
  const before=await page.evaluate(()=>document.getElementById('app-main').scrollTop);
  expect(before).toBeGreaterThan(200);
  await page.evaluate(()=>document.querySelector('.prog-more').click());
  await expect(page.locator('[data-skill="Money"]')).toBeAttached();
  const after=await page.evaluate(()=>document.getElementById('app-main').scrollTop);
  expect(Math.abs(after-before)).toBeLessThan(5);
  expect(errors).toEqual([]);
});

test('rows follow status order even when the log lists Solid first',async({page})=>{
  const errors=await openSeeded(page,{
    log:{
      '2026-11-17':{'math|Adding|3':[9,10,0]},
      '2026-11-18':{
        'math|Adding|3':[9,10,0],
        'math|Counting|3':[1,2,0],
        'math|Subtracting|3':[6,10,0],
      },
    },
  });
  const names=await page.locator('[data-progress-for="simon"] .prog-row').evaluateAll(rows=>rows.map(r=>r.dataset.skill));
  const tracked=names.filter(n=>n==='Subtracting'||n==='Counting'||n==='Adding');
  expect(tracked).toEqual(['Subtracting','Counting','Adding']);
  expect(errors).toEqual([]);
});

test('the gym line follows the tape when the skill totals disagree',async({page})=>{
  const errors=await openSeeded(page,{
    log:{'2026-11-18':{'math|Adding|3':[10,10,0],'math|@|3':'1111100000'}},
  });
  const line=await state(page,log=>gymLineText('math',3,log),{'2026-11-18':{'math|Adding|3':[10,10,0],'math|@|3':'1111100000'}});
  expect(line).toContain('50% right over 10 tries on 1 day');
  expect(line).not.toContain('100% right');
  expect(errors).toEqual([]);
});

test('each trainer card reads only that child\'s log',async({page})=>{
  await page.clock.install({time:TODAY});
  const errors=await openGame(page,{save:{
    v:1,roster:1,activeId:null,
    kids:[
      {id:'maya',name:'Maya',avatar:'#001',data:miniData(3,{
        '2026-11-18':{'math|Adding|3':[10,10,0],'math|@|3':'1'.repeat(10)},
        '2026-11-17':{'math|Adding|3':[8,10,0],'math|@|3':'1'.repeat(8)+'00'},
      })},
      {id:'sam',name:'Sam',avatar:'#004',data:miniData(3,{
        '2026-11-18':{'math|Subtracting|3':[2,3,0],'math|@|3':'110'},
      })},
    ],
  }});
  await openParents(page);
  const maya=page.locator('[data-progress-for="maya"]');
  const sam=page.locator('[data-progress-for="sam"]');
  await expect(maya.locator('[data-skill="Adding"][data-tier="3"]')).toContainText('18 / 20');
  await expect(maya.locator('[data-skill="Adding"] .prog-chip')).toHaveText('Solid');
  const mayaLine=await state(page,log=>gymLineText('math',3,log),{
    '2026-11-18':{'math|Adding|3':[10,10,0],'math|@|3':'1'.repeat(10)},
    '2026-11-17':{'math|Adding|3':[8,10,0],'math|@|3':'1'.repeat(8)+'00'},
  });
  const samLine=await state(page,log=>gymLineText('math',3,log),{
    '2026-11-18':{'math|Subtracting|3':[2,3,0],'math|@|3':'110'},
  });
  expect(mayaLine).toContain('90% right over 20 tries on 2 days');
  await expect(sam.locator('[data-skill="Subtracting"][data-tier="3"]')).toContainText('2 / 3');
  await expect(sam.locator('[data-skill="Subtracting"] .prog-chip')).toHaveText('New');
  expect(samLine).toContain('66% right over 3 tries on 1 day');
  await expect(sam.locator('[data-skill="Adding"][data-tier="3"]')).toContainText('Not yet');
  await expect(maya).not.toContainText('2 / 3');
  expect(errors).toEqual([]);
});

test('the same skill at two grades gets a name from that grade\'s questions',async({page})=>{
  const errors=await openSeeded(page,{
    log:{
      '2026-11-18':{
        'math|Subtracting|2|review':[4,6,0],
        'math|Subtracting|3':[4,6,0],
        'math|Adding|1|review':[1,1,0],
        'math|Adding|3':[1,1,0],
      },
      '2026-11-17':{
        'math|Subtracting|2|review':[3,4,0],
        'math|Subtracting|3':[3,4,0],
      },
    },
  });
  const card=page.locator('[data-progress-for="simon"]');
  const review=card.locator('[data-skill="Subtracting"][data-tier="2"][data-review="1"]');
  const current=card.locator('[data-skill="Subtracting"][data-tier="3"][data-review="0"]');
  await expect(review.locator('.prog-skill')).toContainText('Subtracting within 20');
  await expect(current.locator('.prog-skill')).toContainText('Subtracting within 100');
  await expect(review).toContainText('1st grade · review');
  await expect(current).toContainText('2nd grade');
  const names=await card.locator('[data-skill="Subtracting"] .prog-skill').evaluateAll(els=>els.map(el=>el.childNodes[0].textContent.trim()));
  expect(new Set(names).size).toBe(names.length);
  await expect(card.locator('[data-skill="Adding"][data-tier="1"] .prog-skill')).toContainText('Adding within 5');
  await expect(card.locator('[data-skill="Adding"][data-tier="3"] .prog-skill')).toContainText('Adding within 100');
  expect(await state(page,()=>skillDisplayName('Shapes',1))).toBe('Shapes, sides, and corners');
  expect(await state(page,()=>skillDisplayName('Comparing',1))).toBe('Comparing numbers and sizes');
  expect(await state(page,()=>skillDisplayName('Shapes',3))).toBe('Sides and corners');
  expect(await state(page,()=>skillDisplayName('Comparing',2))).toBe('Comparing numbers to 20');
  const gradeSize=await card.locator('.prog-grade').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  const chipSize=await card.locator('.prog-chip').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(gradeSize).toBe(14);
  expect(chipSize).toBe(14);
  expect(errors).toEqual([]);
});

test('the footer says the 7-day numbers and the 14-day Solid check apart',async({page})=>{
  const errors=await openSeeded(page,{log:{'2026-11-18':{'math|Adding|3':[1,1,0]}}});
  await expect(page.locator('.prog-foot')).toHaveText('Numbers show the last 7 days. Solid looks at the last 14. Solid = 85%+ right, 10+ tries, 2+ days. Practicing = 10+ tries, not solid yet. New = fewer than 10 tries.');
  expect(errors).toEqual([]);
});

test('the Gym banner is on and uses the same numbers as the gate',async({page})=>{
  const zeros='0'.repeat(20);
  const ones='1'.repeat(30);
  const log={
    '2026-11-17':{'math|@|3':zeros,'math|Adding|3':[0,20,0]},
    '2026-11-18':{'math|@|3':ones,'math|Adding|3':[30,30,0]},
  };
  const errors=await openSeeded(page,{log});
  expect(await state(page,()=>MASTERY_GYM)).toBe(true);
  const shown=await state(page,()=>{
    const tier=st.stats.math.level;
    const snap=masterySnapshot(activeKid().data.log,'math',tier);
    return {tier,text:gymLineText('math',tier,activeKid().data.log),pct:snap.pct,att:snap.att,days:snap.days,open:snap.open};
  });
  const tries=shown.att===1?'try':'tries';
  const days=shown.days===1?'1 day':shown.days+' days';
  expect(shown.text).toContain(`${shown.pct}% right over ${shown.att} ${tries} on ${days}`);
  await expect(page.locator('.prog-gym')).toContainText(`${shown.pct}% right over ${shown.att} ${tries} on ${days}`);
  const sample=await state(page,saved=>masterySnapshot(saved,'math',3),log);
  expect(sample).toMatchObject({pct:75,att:40,days:2,open:false});
  const top=await state(page,()=>gymLineText('math',4,{'2026-11-18':{'math|@|4':'11111'}}));
  expect(top).toBe('Top level reached.');
  expect(errors).toEqual([]);
});

test('the parents intro names the child and the practice line leads the card',async({page})=>{
  const errors=await openSeeded(page,{
    practice:{recent:[{s:'math',ok:0}],topics:{'math|Adding':{n:1,ex:['What is 2 + 2?'],recent:[0]}}},
  });
  await expect(page.locator('#parent-intro')).toHaveText('See what Simon is solid on and what to practice.');
  await expect(page.locator('#parent-report')).not.toContainText("How they're doing");
  await expect(page.locator('#parent-report')).not.toContainText('Each child has their own game');
  const lead=await page.locator('[data-progress-for="simon"]').evaluate(card=>{
    const title=card.querySelector('.prog-title');
    return title&&title.nextElementSibling&&title.nextElementSibling.className;
  });
  expect(lead).toContain('parent-practice');
  await expect(page.locator('[data-progress-for="simon"] .parent-practice')).toContainText('Practice adding.');
  expect(errors).toEqual([]);
});
