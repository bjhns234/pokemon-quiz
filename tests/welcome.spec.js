// The welcome screen is once per brand-new trainer, after the starter reveal
// and before question 1. It is not stored on the save: old Pokédexes, and a
// trainer who closes the tablet on this screen, never see it.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

const KINDERGARTEN='Answer questions to level up your Pokémon and master Kindergarten Math!';
const FIRST='Answer questions to level up your Pokémon and master 1st Grade Math!';
const SECOND='Answer questions to level up your Pokémon and master 2nd Grade Math!';
const THIRD='Answer questions to level up your Pokémon and master 3rd Grade Math!';

function kidSlice(raw,id){
  const at=raw.indexOf(`"id":"${id}"`);
  if(at<0)throw new Error(`no kid ${id}`);
  let start=raw.lastIndexOf('{',at);
  let depth=0,inStr=false,esc=false;
  for(let i=start;i<raw.length;i++){
    const c=raw[i];
    if(inStr){
      if(esc)esc=false;
      else if(c==='\\')esc=true;
      else if(c==='"')inStr=false;
      continue;
    }
    if(c==='"')inStr=true;
    else if(c==='{')depth++;
    else if(c==='}'){
      depth--;
      if(depth===0)return raw.slice(start,i+1);
    }
  }
  throw new Error(`unclosed kid ${id}`);
}

// Name, then the shared chooser, then the reveal's callback. `real` lets the
// ball animation finish; otherwise the reveal resolves immediately.
async function toWelcome(page,{name='Maya',grade=null,shiny=false,line=0,real=false}={}){
  await page.click('#profile-new');
  await page.fill('#profile-name',name);
  await page.click('#profile-next');
  await expect(page.locator('.starter-card')).toBeVisible();
  await state(page,o=>{
    if(o.grade!=null)st.grade=o.grade;
    if(o.shiny)rollShiny=()=>true;
    if(!o.real)playStarterReveal=function(line,shiny,done){done();};
  },{grade,shiny,real});
  await page.click('#pick-'+line);
  await expect(page.locator('#welcome-overlay.active')).toBeVisible({timeout:real?20000:8000});
}

async function inside(page,selector){
  return page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {
      top:r.top,left:r.left,right:r.right,bottom:r.bottom,
      width:r.width,height:r.height,
      scroll:document.documentElement.scrollHeight,
      viewH:window.innerHeight,viewW:window.innerWidth,
      lineScrollW:el.scrollWidth,lineClientW:el.clientWidth,
      lineScrollH:el.scrollHeight,lineClientH:el.clientHeight,
    };
  });
}

test('a fresh tablet shows the welcome after the reveal, then waits',async({page})=>{
  test.setTimeout(30000);
  const errors=await openGame(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('#profile-next');
  await page.click('#pick-0');
  await expect(page.locator('#pick-label')).toHaveText('Bulbasaur is your Pokémon!');
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('#welcome-overlay.active')).toBeVisible({timeout:4000});
  await expect(page.locator('#pick-overlay.active')).toHaveCount(0);
  await expect(page.locator('#welcome-line')).toHaveText(KINDERGARTEN);
  await expect(page.locator('#welcome-go')).toHaveText("Let's go!");
  await expect(page.locator('#welcome-overlay button')).toHaveCount(1);
  await expect(page.locator('#welcome-overlay .big-back, #welcome-overlay .close, #welcome-overlay [aria-label="Close"]')).toHaveCount(0);
  await expect(page.locator('#bottom-nav')).toBeHidden();
  await expect(page.locator('#mute-btn')).toBeHidden();
  await expect(page.locator('#parents-link')).toBeHidden();
  await expect(page.locator('.qtext')).toHaveCount(0);
  await page.waitForTimeout(1000);
  await expect(page.locator('.qtext')).toHaveCount(0);
  await expect(page.locator('#welcome-overlay.active')).toBeVisible();
  expect(await state(page,()=>SAVE_V)).toBe(1);
  const raw=await page.evaluate(()=>localStorage.getItem('pkq-save'));
  expect(raw).not.toMatch(/welcome/i);
  expect(JSON.parse(raw).v).toBe(1);
  expect(JSON.parse(raw).kids.map(k=>k.name)).toEqual(['Maya']);
  expect(errors).toEqual([]);
});

test('adding a trainer shows the same welcome, and the other save stays byte-identical',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    const kid=activeKid();
    kid.name='Maya';
    kid.askName=false;
    save();
  });
  const before=await page.evaluate(()=>localStorage.getItem('pkq-save'));
  const mayaId=JSON.parse(before).kids[0].id;
  await page.click('#who-btn');
  await toWelcome(page,{name:'Leo',line:1});
  await expect(page.locator('#welcome-line')).toHaveText(KINDERGARTEN);
  await expect(page.locator('#welcome-go')).toHaveText("Let's go!");
  const during=await page.evaluate(()=>localStorage.getItem('pkq-save'));
  expect(kidSlice(during,mayaId)).toBe(kidSlice(before,mayaId));
  expect(JSON.parse(during).v).toBe(1);
  const leo=JSON.parse(during).kids.find(k=>k.name==='Leo');
  expect(leo.data&&leo.data.welcome).toBeUndefined();
  expect(JSON.stringify(leo)).not.toMatch(/welcome/i);
  await page.click('#welcome-go');
  await expect(page.locator('.qtext')).toBeVisible();
  const after=await page.evaluate(()=>localStorage.getItem('pkq-save'));
  expect(kidSlice(after,mayaId)).toBe(kidSlice(before,mayaId));
  expect(errors).toEqual([]);
});

test("Let's go! lands on question 1 and Back from there is Who's playing",async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  await page.click('#welcome-go');
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('.qtext')).toBeVisible();
  await expect(page.getByText("Who's playing?")).toBeHidden();
  await expect(page.locator('.starter-card')).toBeHidden();
  const landed=await state(page,()=>({phase:st.phase,n:st.round.n,att:st.stats.math.att,pending:[...pendingWelcomeIds]}));
  expect(landed).toEqual({phase:'play',n:0,att:0,pending:[]});
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.goForward();
  await expect(page.locator('.qtext')).toBeVisible();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a grade lock renames the line, and Auto stays Kindergarten',async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page,{grade:3});
  await expect(page.locator('#welcome-line')).toHaveText(SECOND);
  expect(await state(page,()=>activeKid().data.settings.grade)).toBe(3);
  const names=[[1,KINDERGARTEN],[2,FIRST],[4,THIRD],[0,KINDERGARTEN]];
  for(const [grade,text] of names){
    await state(page,g=>{st.grade=g;showWelcome();},grade);
    await expect(page.locator('#welcome-line')).toHaveText(text);
  }
  expect(errors).toEqual([]);
});

test('returning trainers, a reset, a switch, and an evolution never show it',async({page})=>{
  const save={
    v:1,roster:1,activeId:'maya',
    kids:[{
      id:'maya',name:'Maya',avatar:'#001',
      data:{
        v:1,starter:0,activeIdx:0,
        team:[{num:'#001',level:5,xp:0,shiny:false}],
        dex:['#001'],
        stats:{math:{cor:0,att:0,level:1,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
        settings:{grade:3},
      },
    }],
  };
  const errors=await openGame(page,{save});
  await expect(page.locator('.qtext')).toBeVisible();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.getByText('2nd Grade Math')).toHaveCount(0);

  await state(page,()=>{resetCurrentProfile();});
  await state(page,()=>{playStarterReveal=function(line,shiny,done){done();};});
  await page.click('#pick-0');
  await expect(page.locator('.qtext')).toBeVisible();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);

  await state(page,()=>{
    st.team.push({pi:3,level:5,xp:0,shiny:false});
    openSwitchPicker();
  });
  await expect(page.locator('.switch-opt').first()).toBeVisible();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await state(page,()=>{
    closeSwitchPicker();
    playEvolution=function(from,to,shiny,done){done();};
    st.pendingEvo={fromPi:st.team[0].pi,toPi:st.team[0].pi+1};
    processEvolution();
  });
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('closing the tablet on the welcome screen opens the question next time',async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  const raw=await page.evaluate(()=>localStorage.getItem('pkq-save'));
  expect(raw).not.toMatch(/welcome/i);
  await page.reload();
  await expect(page.locator('.qtext')).toBeVisible();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('#welcome-line')).toBeHidden();
  expect(await state(page,()=>SAVE_V)).toBe(1);
  expect(errors).toEqual([]);
});

test("browser Back on the welcome screen goes to Who's playing",async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await expect(page.getByText('Maya')).toBeVisible();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  expect(await state(page,()=>activeKid().name)).toBe('Maya');
  await page.goForward();
  await expect(page.locator('#welcome-overlay.active')).toBeVisible();
  await expect(page.locator('#welcome-line')).toHaveText(KINDERGARTEN);
  await expect(page.locator('.qtext')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the sprite is about 280px on iPad and about 226px on a phone, and the screen fits',async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  // The entrance scales the column for under 300ms. Measure the settled size.
  await page.evaluate(()=>Promise.all([...document.querySelectorAll('#welcome-overlay .welcome-col')].flatMap(el=>el.getAnimations({subtree:true}).map(a=>a.finished))));
  const sizes=[
    {width:768,height:1024,sprite:280,font:28,button:64},
    {width:390,height:844,sprite:226,font:22,button:56},
    {width:375,height:667,sprite:null,font:22,button:56},
  ];
  for(const size of sizes){
    await page.setViewportSize({width:size.width,height:size.height});
    const img=await page.locator('#welcome-img').evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {w:r.width,h:r.height};
    });
    if(size.sprite!=null){
      expect(Math.abs(img.w-size.sprite),`sprite width at ${size.width} was ${img.w}`).toBeLessThanOrEqual(2);
      expect(Math.abs(img.h-size.sprite),`sprite height at ${size.width} was ${img.h}`).toBeLessThanOrEqual(2);
    }
    const font=await page.locator('#welcome-line').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(font,`line at ${size.width}`).toBeGreaterThanOrEqual(size.font);
    const btn=await page.locator('#welcome-go').evaluate(el=>{
      const r=el.getBoundingClientRect();
      const s=getComputedStyle(el);
      return {w:r.width,h:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right,radius:parseFloat(s.borderRadius),weight:s.fontWeight,size:parseFloat(s.fontSize),bg:s.backgroundColor,color:s.color};
    });
    if(size.width===768){
      expect(Math.abs(btn.w-360),`button width at 768 was ${btn.w}`).toBeLessThanOrEqual(2);
      expect(btn.h,`button height at 768 was ${btn.h}`).toBeGreaterThanOrEqual(64);
    }
    expect(btn.h,`button height at ${size.width}`).toBeGreaterThanOrEqual(size.button);
    expect(btn.size).toBeGreaterThanOrEqual(22);
    expect(String(btn.weight)).toMatch(/800|bold/);
    expect(btn.radius).toBeGreaterThanOrEqual(14);
    expect(btn.bg).toBe('rgb(255, 255, 255)');
    expect(btn.color).toBe('rgb(26, 26, 46)');
    const line=await inside(page,'#welcome-line');
    const button=await inside(page,'#welcome-go');
    expect(line.scroll,`scroll at ${size.width}`).toBeLessThanOrEqual(line.viewH);
    for(const box of [line,button]){
      expect(box.top,`top at ${size.width}`).toBeGreaterThanOrEqual(-1);
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right,`right at ${size.width}`).toBeLessThanOrEqual(box.viewW+1);
      expect(box.bottom,`bottom at ${size.width}`).toBeLessThanOrEqual(box.viewH+1);
    }
    expect(line.lineScrollW,`line clips at ${size.width}`).toBeLessThanOrEqual(line.lineClientW+1);
    expect(line.lineScrollH).toBeLessThanOrEqual(line.lineClientH+1);
    expect(btn.bottom,`button at ${size.width}`).toBeLessThanOrEqual(size.height+1);
    expect(btn.top).toBeGreaterThanOrEqual(-1);
  }
  expect(errors).toEqual([]);
});

test("Back, then the other trainer, does not steal the new trainer's welcome",async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    const kid=activeKid();
    kid.name='Maya';
    kid.askName=false;
    save();
  });
  await page.click('#who-btn');
  await toWelcome(page,{name:'Leo',line:1});
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/4\.png$/);
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('.qtext')).toBeVisible();
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Leo'}).click();
  await expect(page.locator('#welcome-overlay.active')).toBeVisible();
  await expect(page.locator('#welcome-line')).toHaveText(KINDERGARTEN);
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/4\.png$/);
  await expect(page.locator('.qtext')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a Gym sibling who is reset does not inherit the pending welcome',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    const kid=activeKid();
    kid.name='Maya';
    kid.askName=false;
    const tier=st.stats.math.level;
    st.gym={sub:'math',tier,queue:gymQueue('math',tier),qi:0,kid:GYM_KID_HP,lead:GYM_LEAD_HP,solved:false,over:null};
    st.phase='gym';
    save();
  });
  await page.click('#who-btn');
  await toWelcome(page,{name:'Leo',line:1});
  await page.goBack();
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  await expect(page.locator('.gym-card, .gym-name, .qtext').first()).toBeVisible();
  await state(page,()=>{resetCurrentProfile();});
  await expect(page.locator('.starter-card')).toBeVisible();
  await state(page,()=>{playStarterReveal=function(line,shiny,done){done();};});
  await page.click('#pick-0');
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('.qtext')).toBeVisible();
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Leo'}).click();
  await expect(page.locator('#welcome-overlay.active')).toBeVisible();
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/4\.png$/);
  expect(errors).toEqual([]);
});

test('two new trainers each keep their own welcome',async({page})=>{
  const errors=await openGame(page);
  await startGame(page,'math');
  await state(page,()=>{
    const kid=activeKid();
    kid.name='Maya';
    kid.askName=false;
    save();
  });
  await page.click('#who-btn');
  await toWelcome(page,{name:'Leo',line:1});
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/4\.png$/);
  await page.goBack();
  await toWelcome(page,{name:'Sam',line:2});
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/7\.png$/);
  await page.goBack();
  await page.locator('[data-pick]').filter({hasText:'Leo'}).click();
  await expect(page.locator('#welcome-overlay.active')).toBeVisible();
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/4\.png$/);
  await expect(page.locator('.qtext')).toBeHidden();
  await page.click('#welcome-go');
  await expect(page.locator('.qtext')).toBeVisible();
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Sam'}).click();
  await expect(page.locator('#welcome-overlay.active')).toBeVisible();
  await expect(page.locator('#welcome-img')).toHaveAttribute('src',/\/7\.png$/);
  expect(errors).toEqual([]);
});

test('reset while the welcome is up hides the overlay',async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  await state(page,()=>{resetCurrentProfile();});
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('#welcome-overlay')).toHaveAttribute('aria-hidden','true');
  await expect(page.locator('.starter-card')).toBeVisible();
  await expect(page.locator('#welcome-go')).toBeHidden();
  expect(errors).toEqual([]);
});

test("Let's go is focused, so Enter dismisses the welcome",async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  await expect(page.locator('#welcome-go')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  await expect(page.locator('.qtext')).toBeVisible();
  expect(errors).toEqual([]);
});

test('leaving the welcome marks the overlay hidden',async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page);
  await expect(page.locator('#welcome-overlay')).toHaveAttribute('aria-hidden','false');
  await page.goBack();
  await expect(page.locator('#welcome-overlay')).toHaveAttribute('aria-hidden','true');
  await expect(page.locator('#welcome-overlay.active')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reduced motion shows the welcome with no animation and still rays hidden',async({page})=>{
  const errors=await openGame(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await toWelcome(page);
  const motion=await page.evaluate(()=>{
    const col=document.querySelector('#welcome-overlay .welcome-col');
    const rays=document.getElementById('welcome-rays');
    const cs=getComputedStyle(col);
    const rs=getComputedStyle(rays);
    return {name:cs.animationName,dur:cs.animationDuration,rays:rs.animationName,rayDisplay:rs.display,opacity:cs.opacity};
  });
  expect(motion.name).toBe('none');
  expect(motion.rays).toBe('none');
  expect(motion.rayDisplay).toBe('none');
  expect(Number(motion.opacity)).toBe(1);
  expect(errors).toEqual([]);
});

test('the welcome fades in under 300ms, and hover only applies when hover works',async({page})=>{
  const errors=await openGame(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await toWelcome(page);
  const motion=await page.evaluate(()=>{
    const col=document.querySelector('#welcome-overlay .welcome-col');
    const cs=getComputedStyle(col);
    const dur=cs.animationDuration.split(',')[0].trim();
    const ms=dur.endsWith('ms')?parseFloat(dur):parseFloat(dur)*1000;
    return {name:cs.animationName,ms};
  });
  expect(motion.name).not.toBe('none');
  expect(motion.ms).toBeGreaterThan(0);
  expect(motion.ms).toBeLessThan(300);
  const rules=await page.evaluate(()=>{
    const found=[];
    function walk(list,media){
      for(const rule of list){
        if(rule.selectorText)found.push({sel:rule.selectorText,media,css:rule.style?rule.style.cssText:''});
        else if(rule.cssRules)walk(rule.cssRules,rule.conditionText||media||'');
      }
    }
    for(const sheet of document.styleSheets){
      try{walk(sheet.cssRules,'');}catch(e){}
    }
    return found.filter(r=>/#welcome-go/.test(r.sel)&&/:hover|:focus/.test(r.sel));
  });
  const hover=rules.filter(r=>/:hover/.test(r.sel));
  expect(hover.length).toBeGreaterThan(0);
  hover.forEach(rule=>expect(rule.media).toMatch(/hover:\s*hover/));
  const focus=rules.filter(r=>/:focus(?!-)/.test(r.sel));
  focus.forEach(rule=>expect(rule.css).toMatch(/outline:\s*none/));
  const visible=rules.filter(r=>/:focus-visible/.test(r.sel));
  expect(visible.some(r=>/outline/.test(r.css)&&!/outline:\s*none/.test(r.css))).toBe(true);
  expect(errors).toEqual([]);
});

test('a shiny starter is the shiny sprite on the welcome screen',async({page})=>{
  const errors=await openGame(page);
  await toWelcome(page,{shiny:true});
  const src=await page.locator('#welcome-img').getAttribute('src');
  expect(src).toContain('/shiny/1.png');
  await expect(page.locator('#welcome-line')).toHaveText(KINDERGARTEN);
  expect(await state(page,()=>!!st.team[0].shiny)).toBe(true);
  expect(errors).toEqual([]);
});
