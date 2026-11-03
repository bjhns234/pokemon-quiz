// A parent can hold a child at a grade. Auto is the old move-up rule.
// Past kindergarten, every 5th regular question is earlier work, and that
// answer does not move the level-up or level-down streak.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,nextQuestion,serve,pinXp}=require('./helpers');

const SIZES=[
  {width:667,height:375},
  {width:568,height:320},
  {width:320,height:568},
  {width:375,height:667},
  {width:768,height:1024},
];

const oldSave={
  v:1,starter:0,activeIdx:0,team:[{num:'#001',level:7,xp:3}],dex:['#001'],
  stats:{math:{cor:1,att:1,level:1,cs:0,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
};

async function passParentGate(page){
  const q=await page.locator('#parent-q').innerText();
  const m=q.match(/(\d+)\s*times\s*(\d+)/i);
  expect(m,'parent check should be a multiplication').not.toBeNull();
  for(const d of String(Number(m[1])*Number(m[2])))await page.locator(`[data-parent-digit="${d}"]`).click();
  await page.click('#parent-go');
  await expect(page.locator('#grade-setting')).toBeVisible();
}

async function openParents(page){
  if(await page.locator('#grade-setting').count())return;
  if(!(await page.locator('#parents-link').isVisible())){
    if(await page.locator('#nav-pdx').isVisible())await page.click('#nav-pdx');
  }
  await page.click('#parents-link');
  await passParentGate(page);
}

// Parents is opened from the Pokédex, so Back lands there. The game is the
// screen the next answer is played on.
async function backToGame(page){
  await page.click('#parent-back');
  if(await page.locator('#nav-game').isVisible())await page.click('#nav-game');
  await expect(page.locator('#game')).toBeVisible();
}

function row(page,name){
  return page.locator('.grade-row').filter({hasText:name});
}

async function fresh(page){
  const errors=await openGame(page);
  await startGame(page,'math');
  return errors;
}

test('an old save loads as Auto and a Gym win still moves up',async({page})=>{
  const errors=await openGame(page,{save:oldSave});
  expect(await state(page,()=>st.grade)).toBe(0);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  await openParents(page);
  const auto=page.locator('#grade-setting .grade-choice[data-grade="auto"]');
  await expect(auto).toHaveAttribute('aria-pressed','true');
  await expect(auto).toHaveClass(/sel/);
  await backToGame(page);

  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:1,idx:i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math}))).toEqual({level:1,offer:{tier:1,cool:0}});
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math],phase:st.phase}))).toEqual({
    level:2,badges:[1],phase:'award',
  });
  expect(errors).toEqual([]);
});

test('an unknown grade is Auto',async({page})=>{
  const save={...oldSave,settings:{grade:'banana'}};
  const errors=await openGame(page,{save});
  expect(await state(page,()=>st.grade)).toBe(0);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  expect(errors).toEqual([]);
});

async function parkPastEvolution(page){
  await state(page,()=>{
    const tm=activeTM();
    const line=LINES.find(ln=>ln.includes(tm.pi))||[tm.pi];
    tm.pi=line[line.length-1];
    tm.level=60;
    tm.xp=0;
    st.pendingEvo=null;
  });
}

test('locking kindergarten stays in tier 1, and a Gym win gives the badge only',async({page})=>{
  const errors=await fresh(page);
  await parkPastEvolution(page);
  await openParents(page);
  await page.locator('#grade-setting .grade-choice[data-grade="1"]').click();
  await expect(page.locator('#grade-setting .grade-choice[data-grade="1"]')).toHaveAttribute('aria-pressed','true');
  await backToGame(page);
  expect(await state(page,()=>st.grade)).toBe(1);
  await expect(page.locator('#game .grade-choice, #game #grade-setting')).toHaveCount(0);

  const dealt=await state(page,()=>{
    st.review=[];
    st.stats.math.cs=0;
    st.stats.math.ws=0;
    st.badges.math=[];
    st.gymOffer.math=null;
    const tiers=[];
    for(let i=0;i<24;i++){
      loadQuestion();
      tiers.push(st.q.tmpl.lv);
      st.armAt=0;
      commitAttempt(true,st.q.correctIndex);
    }
    return tiers;
  });
  expect(dealt.every(lv=>lv===1)).toBe(true);
  expect(await state(page,()=>st.stats.math.level)).toBe(1);
  expect(await state(page,()=>st.gymOffer.math)).toEqual({tier:1,cool:0});

  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await expect(page.locator('.award-card')).toBeVisible();
  await expect(page.locator('.award-card')).toContainText('Bolt Badge');
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math]}))).toEqual({level:1,badges:[1]});
  await page.click('#award-go');

  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:1,idx:30+i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math,badges:[...st.badges.math]}))).toEqual({
    level:1,offer:null,badges:[1],
  });
  expect(errors).toEqual([]);
});

test('locking 1st grade moves to tier 2, drops to kindergarten, and climbs back without reaching tier 3',async({page})=>{
  const errors=await fresh(page);
  await parkPastEvolution(page);
  await state(page,()=>{st.stats.math.level=1;st.stats.math.cs=0;st.badges.math=[1];st.gymOffer.math=null;});
  await openParents(page);
  // 1st grade is tier 2. The button label is taken from TIER_PLAIN.
  await page.locator('#grade-setting .grade-choice[data-grade="2"]').click();
  await expect(page.locator('#grade-setting .grade-choice[data-grade="2"]')).toHaveAttribute('aria-pressed','true');
  expect(await state(page,()=>st.stats.math.level)).toBe(2);
  await backToGame(page);
  await nextQuestion(page);
  expect(await state(page,()=>st.q.tmpl.lv)).toBe(2);

  for(let i=0;i<3;i++){
    await serve(page,{sub:'math',lv:2,idx:i});
    await answer(page,false);
  }
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math]}))).toEqual({level:1,badges:[1]});

  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:1,idx:10+i});
    await answer(page,true);
  }
  expect(await state(page,()=>st.stats.math.level)).toBe(2);

  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:2,idx:10+i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math}))).toEqual({level:2,offer:{tier:2,cool:0}});
  await page.click('[data-gym-start="math"]');
  await state(page,()=>{st.gym.lead=1;});
  await answer(page,true);
  await expect(page.locator('.award-card')).toBeVisible();
  expect(await state(page,()=>({level:st.stats.math.level,badges:[...st.badges.math].sort()}))).toEqual({level:2,badges:[1,2]});
  await page.click('#award-go');

  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:2,idx:20+i});
    await answer(page,true);
  }
  expect(await state(page,()=>({level:st.stats.math.level,offer:st.gymOffer.math}))).toEqual({level:2,offer:null});

  await openParents(page);
  await page.locator('#grade-setting .grade-choice[data-grade="auto"]').click();
  await backToGame(page);
  expect(await state(page,()=>st.grade)).toBe(0);
  for(let i=0;i<5;i++){
    await serve(page,{sub:'math',lv:2,idx:30+i});
    await answer(page,true);
  }
  expect(await state(page,()=>st.stats.math.level)).toBe(3);
  expect(errors).toEqual([]);
});

test('every 5th regular question is earlier work, and it leaves the streaks alone',async({page})=>{
  const errors=await fresh(page);
  const dealt=await state(page,()=>{
    st.stats.math.level=4;
    st.stats.math.cs=0;
    st.stats.math.ws=0;
    st.badges.math=[1,2,3];
    st.gymOffer.math=null;
    st.review=[];
    st.seen=[];
    st.reviewCount={math:0,reading:0,science:0};
    st.grade=0;
    const out=[];
    for(let i=0;i<25;i++){
      st.stats.math.level=4;
      loadQuestion();
      out.push({lv:st.q.tmpl.lv,review:!!st.q.bankReview,rematch:!!st.q.rematch});
    }
    return out;
  });
  expect(dealt).toHaveLength(25);
  const reviewTiers=[];
  dealt.forEach((q,i)=>{
    expect(q.rematch).toBe(false);
    if((i+1)%5===0){
      expect(q.review).toBe(true);
      expect(q.lv).toBeLessThan(4);
      reviewTiers.push(q.lv);
    } else {
      expect(q.review).toBe(false);
      expect(q.lv).toBe(4);
    }
  });
  // Just below gets 3 of every 5. The other two are the tiers under that.
  expect(reviewTiers).toEqual([3,3,3,2,1]);
  const labeled=await page.locator('.qcard').innerText();
  expect(labeled).not.toMatch(/\breview\b/i);
  expect(labeled).not.toMatch(/\beasy\b/i);

  const gym=await state(page,()=>{
    const before=st.reviewCount.math;
    st.stats.math.level=2;
    st.badges.math=[1];
    st.gymOffer.math={tier:2,cool:0};
    st.cor=true;
    st.phase='play';
    startGym('math');
    const tiers=[st.q.tmpl.lv];
    const flagged=[!!st.q.bankReview];
    for(let i=0;i<4;i++){
      st.cor=true;
      onGymNext();
      if(st.phase!=='gym')break;
      tiers.push(st.q.tmpl.lv);
      flagged.push(!!st.q.bankReview);
    }
    return {tiers,flagged,count:st.reviewCount.math,before,phase:st.phase};
  });
  expect(gym.phase).toBe('gym');
  expect(gym.tiers.length).toBeGreaterThan(1);
  expect(gym.tiers.every(lv=>lv===2)).toBe(true);
  expect(gym.flagged.every(f=>f===false)).toBe(true);
  expect(gym.count).toBe(gym.before);

  await pinXp(page);
  const scored=await state(page,()=>{
    st.phase='play';
    st.gym=null;
    st.stats.math.level=3;
    st.stats.math.cs=2;
    st.stats.math.ws=1;
    st.reviewCount.math=4;
    st.review=[];
    st.practice=freshPractice();
    const beforeXp=activeTM().xp;
    loadQuestion();
    const dealt={lv:st.q.tmpl.lv,review:!!st.q.bankReview,rematch:!!st.q.rematch};
    st.armAt=0;
    commitAttempt(true,st.q.correctIndex);
    const right={
      dealt,
      cs:st.stats.math.cs,
      ws:st.stats.math.ws,
      cor:st.stats.math.cor,
      xp:activeTM().xp-beforeXp,
      recent:st.practice.recent.length,
    };
    st.stats.math.cs=2;
    st.stats.math.ws=1;
    st.reviewCount.math=4;
    st.review=[];
    loadQuestion();
    const missDeal={lv:st.q.tmpl.lv,review:!!st.q.bankReview,key:reviewKey(st.q.tmpl)};
    st.armAt=0;
    const wrong=st.q.correctIndex===0?1:0;
    commitAttempt(false,wrong);
    return {
      right,
      miss:{
        dealt:missDeal,
        cs:st.stats.math.cs,
        ws:st.stats.math.ws,
        queued:st.review.map(reviewKey),
        recent:st.practice.recent.length,
      },
    };
  });
  expect(scored.right.dealt).toEqual({lv:2,review:true,rematch:false});
  expect(scored.right.cs).toBe(2);
  expect(scored.right.ws).toBe(1);
  expect(scored.right.cor).toBeGreaterThan(0);
  expect(scored.right.xp).toBeGreaterThan(0);
  expect(scored.right.recent).toBe(1);
  // Count was put back to 4, so this is the first review pick: the tier just below.
  expect(scored.miss.dealt.review).toBe(true);
  expect(scored.miss.dealt.lv).toBe(2);
  expect(scored.miss.cs).toBe(2);
  expect(scored.miss.ws).toBe(1);
  expect(scored.miss.queued).toContain(scored.miss.dealt.key);
  expect(scored.miss.recent).toBe(2);

  const skipped=await state(page,()=>{
    st.stats.math.level=3;
    st.reviewCount.math=4;
    st.review=[{sub:'math',lv:3,idx:0,wins:0,due:0,why:'miss'}];
    st.served=10;
    st.lastRematchAt=null;
    loadQuestion();
    const rematch={rematch:!!st.q.rematch,review:!!st.q.bankReview,count:st.reviewCount.math};
    loadQuestion();
    return {rematch,next:{review:!!st.q.bankReview,rematch:!!st.q.rematch,lv:st.q.tmpl.lv,count:st.reviewCount.math}};
  });
  expect(skipped.rematch).toEqual({rematch:true,review:false,count:4});
  expect(skipped.next.rematch).toBe(false);
  expect(skipped.next.review).toBe(true);
  expect(skipped.next.lv).toBeLessThan(3);
  expect(skipped.next.count).toBe(5);
  expect(errors).toEqual([]);
});

test('a grade is saved per child and still selected after a reload',async({page})=>{
  const errors=await openGame(page);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('[data-avatar="001"]');
  await page.click('#profile-save');
  await page.evaluate(()=>{pickStarter(0,false);chooseSubject('math');});

  await page.click('#who-btn');
  await page.click('#profile-new');
  await page.fill('#profile-name','Leo');
  await page.click('[data-avatar="004"]');
  await page.click('#profile-save');
  await page.evaluate(()=>{pickStarter(1,false);chooseSubject('math');});

  await openParents(page);
  await row(page,'Maya').locator('[data-grade="1"]').click();
  await row(page,'Leo').locator('[data-grade="3"]').click();
  await expect(row(page,'Maya').locator('[data-grade="1"]')).toHaveAttribute('aria-pressed','true');
  await expect(row(page,'Leo').locator('[data-grade="3"]')).toHaveAttribute('aria-pressed','true');
  await expect(row(page,'Maya').locator('[data-grade="3"]')).toHaveAttribute('aria-pressed','false');

  const saved=await page.evaluate(()=>{
    const kids=JSON.parse(localStorage.getItem('pkq-save')).kids;
    return kids.map(k=>({name:k.name,grade:k.data&&k.data.settings&&k.data.settings.grade,level:k.data&&k.data.stats.math.level}));
  });
  expect(saved).toEqual([
    {name:'Maya',grade:1,level:1},
    {name:'Leo',grade:3,level:3},
  ]);

  await page.reload();
  await expect(page.locator('#who-screen')).toBeVisible();
  await page.click('#parents-link');
  await passParentGate(page);
  await expect(row(page,'Maya').locator('[data-grade="1"]')).toHaveAttribute('aria-pressed','true');
  await expect(row(page,'Leo').locator('[data-grade="3"]')).toHaveAttribute('aria-pressed','true');
  await expect(row(page,'Leo').locator('[data-grade="auto"]')).toHaveAttribute('aria-pressed','false');

  await page.click('#parent-back');
  await page.locator('[data-pick]').filter({hasText:'Maya'}).click();
  expect(await state(page,()=>({grade:st.grade,level:st.stats.math.level,name:activeKid().name}))).toEqual({grade:1,level:1,name:'Maya'});
  await page.click('#who-btn');
  await page.locator('[data-pick]').filter({hasText:'Leo'}).click();
  expect(await state(page,()=>({grade:st.grade,level:st.stats.math.level,name:activeKid().name}))).toEqual({grade:3,level:3,name:'Leo'});
  expect(errors).toEqual([]);
});

test('the grade row meets tap, type, and contrast rules',async({page})=>{
  test.setTimeout(120000);
  const errors=await fresh(page);
  await openParents(page);
  for(const size of SIZES){
    await page.setViewportSize(size);
    const audit=await page.evaluate(()=>{
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
      const root=document.getElementById('parent-page');
      const small=[];
      const faint=[];
      const short=[];
      const seen=new Set();
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let n;
      while((n=walker.nextNode())){
        if(!n.textContent||!n.textContent.trim())continue;
        const el=n.parentElement;
        if(!el||!shown(el)||seen.has(el))continue;
        seen.add(el);
        const s=getComputedStyle(el);
        const size=parseFloat(s.fontSize);
        const sample=(el.textContent||'').trim().slice(0,48);
        if(size<14)small.push({sample,size});
        const fg=parse(s.color);
        if(!fg)continue;
        const bg=backdrop(el);
        const blended=[fg.r*fg.a+bg[0]*(1-fg.a),fg.g*fg.a+bg[1]*(1-fg.a),fg.b*fg.a+bg[2]*(1-fg.a)];
        const L1=lum(blended),L2=lum(bg);
        const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
        if(ratio<4.5)faint.push({sample,ratio:+ratio.toFixed(2),color:s.color});
      }
      root.querySelectorAll('button').forEach(el=>{
        if(!shown(el))return;
        const r=el.getBoundingClientRect();
        if(r.height<44||r.width<44)short.push({id:el.id||el.className,h:Math.round(r.height),w:Math.round(r.width)});
      });
      const box=document.getElementById('grade-setting').getBoundingClientRect();
      return {
        small,faint,short,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        gradeRight:box.right,
        gradeLeft:box.left,
        width:window.innerWidth,
      };
    });
    expect(audit.small,`small text at ${size.width}x${size.height}`).toEqual([]);
    expect(audit.faint,`contrast at ${size.width}x${size.height}`).toEqual([]);
    expect(audit.short,`tap targets at ${size.width}x${size.height}`).toEqual([]);
    expect(audit.gradeLeft).toBeGreaterThanOrEqual(-1);
    expect(audit.gradeRight).toBeLessThanOrEqual(size.width+1);
    if(size.width===568&&size.height===320)expect(audit.overflow).toBeLessThanOrEqual(1);
  }
  const selected=await page.locator('#grade-setting .grade-choice.sel').evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(selected).toBe('rgb(26, 26, 46)');
  expect(errors).toEqual([]);
});
