// The Game / Pokédex bar sits in the page flow, under the questions.
// At every size we play on, a tap lands on the control itself.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

const SIZES=[
  {width:320,height:568},
  {width:390,height:844},
  {width:568,height:320},
  {width:932,height:430},
  {width:768,height:1024},
  {width:1024,height:768},
  {width:1440,height:900},
];

const legacy={v:1,starter:0,activeIdx:0,team:[{num:'#001',level:7,xp:3}],dex:['#001'],
  stats:{math:{cor:5,att:6,level:2,cs:1,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}},
  review:[{sub:'math',lv:1,idx:0,q:'What is 1 + 2?',wins:0}],
  badges:{math:[1],reading:[],science:[]}};

function serveStem(page,needle){
  return page.evaluate(n=>{
    for(const sub of Object.keys(QB))
      for(const lv of Object.keys(QB[sub])){
        const idx=QB[sub][lv].findIndex(q=>q[0].includes(n));
        if(idx<0)continue;
        const deck=QUEUES[sub][lv];
        const at=deck.indexOf(idx);
        if(at>=0)deck.splice(at,1);
        st.q=serveQuestion(sub,+lv,idx,questionPname());
        st.sel=null;st.cor=false;st.anim='';st.helped=false;
        st.tries=0;st.wrong=[];st.lastXp=0;st.draft='';st.armAt=0;st.wildEscape=false;
        st.phase='play';
        render();
        return st.q.question;
      }
    return null;
  },needle).then(found=>{
    expect(found,`no question stem contains ${JSON.stringify(needle)}`).not.toBeNull();
    return found;
  });
}

async function toTop(page){
  await page.evaluate(()=>{
    window.scrollTo(0,0);
    const main=document.getElementById('app-main');
    if(main)main.scrollTop=0;
  });
}

// Every visible control is fully inside the area above the bar, or scrolled
// there, and a tap in its middle hits that control rather than the bar.
async function clearOfBar(page,selector){
  const nav=page.locator('#bottom-nav');
  const navOn=await nav.isVisible();
  const navBox=navOn?await nav.boundingBox():null;
  const limit=navBox?navBox.y:page.viewportSize().height;
  const loc=page.locator(selector);
  const n=await loc.count();
  for(let i=0;i<n;i++){
    const el=loc.nth(i);
    const skip=await el.evaluate(node=>{
      const cs=getComputedStyle(node);
      if(cs.display==='none'||cs.visibility==='hidden')return true;
      if(node.getAttribute('aria-hidden')==='true')return true;
      const r=node.getBoundingClientRect();
      return r.width<2||r.height<2;
    }).catch(()=>true);
    if(skip)continue;
    await el.scrollIntoViewIfNeeded();
    const box=await el.boundingBox();
    expect(box,selector).not.toBeNull();
    const cx=box.x+box.width/2;
    const cy=box.y+box.height/2;
    expect(cy,`${selector} center`).toBeGreaterThanOrEqual(0);
    expect(cy,`${selector} center`).toBeLessThan(limit);
    if(box.height<=limit-1){
      expect(box.y,`${selector} top`).toBeGreaterThanOrEqual(-1);
      expect(box.y+box.height,`${selector} bottom`).toBeLessThanOrEqual(limit+1);
    }
    const hit=await page.evaluate(({x,y})=>{
      const node=document.elementFromPoint(x,y);
      const bar=document.getElementById('bottom-nav');
      return {bar:!!(node&&bar&&(node===bar||bar.contains(node))),id:node&&node.id,tag:node&&node.tagName};
    },{x:cx,y:cy});
    expect(hit.bar,`${selector} tap landed on ${hit.id||hit.tag}`).toBe(false);
    const owns=await el.evaluate((node,{x,y})=>{
      const hit=document.elementFromPoint(x,y);
      return !!(hit&&(hit===node||node.contains(hit)||hit.contains(node)));
    },{x:cx,y:cy});
    expect(owns,selector).toBe(true);
  }
}

test('questions, Next, Gym, and the name line stay above the bar',async({page})=>{
  test.setTimeout(120000);
  await openGame(page);
  await startGame(page,'math');
  for(const size of SIZES){
    await page.setViewportSize(size);
    await serveStem(page,'Which word rhymes with BLOCK?');
    await toTop(page);
    if(size.width===568&&size.height===320){
      const nav=await page.locator('#bottom-nav').boundingBox();
      const q=await page.locator('.qtext').boundingBox();
      const pic=await page.locator('.psvg img').boundingBox();
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y+q.height).toBeLessThanOrEqual(nav.y+0.5);
      expect(pic.height).toBeGreaterThan(20);
      expect(pic.height).toBeLessThanOrEqual(64);
      const n=await page.locator('.ans-btn').count();
      expect(n).toBe(4);
      for(let i=0;i<n;i++){
        const a=await page.locator('.ans-btn').nth(i).boundingBox();
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y+a.height).toBeLessThanOrEqual(nav.y+0.5);
      }
      const tapped=await page.evaluate(()=>{
        const q=document.querySelector('.qtext').getBoundingClientRect();
        const hit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);
        const bar=document.getElementById('bottom-nav');
        return !(hit&&bar&&(hit===bar||bar.contains(hit)));
      });
      expect(tapped).toBe(true);
    }
    await clearOfBar(page,'#game button, #game input, #mute-btn');

    await serveStem(page,'What is 25 + 10?');
    await toTop(page);
    if(size.width===320&&size.height===568){
      await state(page,()=>{st.badges.math=[1];render();});
      for(const sel of ['.psvg','.xp-row','.badge-row']){
        const shown=await page.locator(sel).evaluate(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>8);
        expect(shown,sel).toBe(true);
      }
      const check=await page.locator('[data-pad="check"]').boundingBox();
      const nav=await page.locator('#bottom-nav').boundingBox();
      expect(check.y+check.height).toBeLessThanOrEqual(nav.y+1);
    }
    if(size.height<=360){
      const key=await page.locator('.pad-key').first().boundingBox();
      expect(key.height).toBeGreaterThanOrEqual(40);
    }
    await clearOfBar(page,'#game button, #game input, #mute-btn');

    await state(page,()=>{st.armAt=0;submitTyped(st.q.answers[st.q.correctIndex]);});
    await toTop(page);
    if(size.width===568&&size.height===320){
      const nav=await page.locator('#bottom-nav').boundingBox();
      const nxt=await page.locator('#nxt').boundingBox();
      const pic=await page.locator('.psvg img').boundingBox();
      expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      expect(await page.evaluate(()=>document.getElementById('app-main').scrollTop)).toBe(0);
      expect(nxt.y).toBeGreaterThanOrEqual(0);
      expect(nxt.y+nxt.height).toBeLessThanOrEqual(nav.y+0.5);
      expect(pic.height).toBeGreaterThan(20);
      expect(pic.height).toBeLessThanOrEqual(64);
    }
    await clearOfBar(page,'#game button, #game input, #mute-btn');
  }

  await state(page,()=>{
    st.stats.math.level=1;
    st.stats.math.cs=0;
    st.badges.math=[];
    st.gymOffer.math={tier:1,cool:0};
    st.cor=true;
    st.phase='play';
    render();
  });
  await page.locator('[data-gym-start="math"]').scrollIntoViewIfNeeded();
  await page.click('[data-gym-start="math"]');
  for(const size of SIZES){
    await page.setViewportSize(size);
    await clearOfBar(page,'#game button, #game input, #mute-btn');
  }
});

test('an old save name line and Ask for help stay tappable',async({page})=>{
  test.setTimeout(90000);
  await openGame(page,{save:legacy});
  for(const size of SIZES){
    await page.setViewportSize(size);
    await serveStem(page,'5 steps forward');
    await toTop(page);
    if(size.width===320&&size.height===568){
      const input=await page.locator('#name-ask-input').boundingBox();
      expect(input.width).toBeGreaterThanOrEqual(120);
      expect(input.height).toBeGreaterThanOrEqual(44);
    }
    if((size.width===568&&size.height===320)||(size.width===932&&size.height===430)){
      const nav=await page.locator('#bottom-nav').boundingBox();
      const help=await page.locator('#help-btn').boundingBox();
      expect(help.y).toBeGreaterThanOrEqual(0);
      expect(help.y+help.height).toBeLessThanOrEqual(nav.y-3);
    }
    if(size.width>=1024&&size.height>=768){
      const pic=await page.locator('.psvg').evaluate(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>40);
      const xp=await page.locator('.xp-row').evaluate(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>8);
      expect(pic).toBe(true);
      expect(xp).toBe(true);
    }
    await clearOfBar(page,'#game button, #game input, #mute-btn');
  }
  await page.setViewportSize({width:568,height:320});
  await serveStem(page,'5 steps forward');
  await toTop(page);
  await page.click('#help-btn');
  await expect(page.locator('.help-box')).toBeVisible();
  await expect(page.locator('#pokedex-page')).toBeHidden();
  await expect(page.locator('#nav-game')).toHaveClass(/nav-active/);

  await page.setViewportSize({width:932,height:430});
  await serveStem(page,'5 steps forward');
  await toTop(page);
  await page.click('#help-btn');
  await expect(page.locator('.help-box')).toBeVisible();
  await expect(page.locator('#pokedex-page')).toBeHidden();
});

test('the Parents PIN pad is on screen at every size',async({page})=>{
  test.setTimeout(90000);
  await openGame(page);
  await startGame(page,'math');
  await page.click('#nav-pdx');
  await page.locator('#parents-link').click();
  await expect(page.locator('#parent-q')).toBeVisible();
  for(const size of SIZES){
    await page.setViewportSize(size);
    await toTop(page);
    if(size.width===568&&size.height===320){
      const keys=page.locator('#parent-check .pad-key');
      const n=await keys.count();
      for(let i=0;i<n;i++){
        const hidden=await keys.nth(i).evaluate(el=>getComputedStyle(el).visibility==='hidden');
        if(hidden)continue;
        const box=await keys.nth(i).boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y+box.height).toBeLessThanOrEqual(size.height+0.5);
        expect(box.height).toBeGreaterThanOrEqual(32);
      }
      const go=await page.locator('#parent-go').boundingBox();
      expect(go.y).toBeGreaterThanOrEqual(0);
      expect(go.y+go.height).toBeLessThanOrEqual(size.height+0.5);
    }
    await clearOfBar(page,'#parent-page button, #parent-page input');
  }
});

test('keyboard digits, Backspace, and Enter drive the number pad',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  await serveStem(page,'What is 25 + 10?');
  await state(page,()=>{st.armAt=0;});
  await page.locator('[data-digit="5"]').focus();
  await page.keyboard.press('3');
  await page.keyboard.press('5');
  await expect(page.locator('#pad-read')).toHaveText('35');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#pad-read')).toHaveText('3');
  await page.keyboard.press('5');
  await expect(page.locator('#pad-read')).toHaveText('35');
  await page.keyboard.press('Enter');
  expect(await state(page,()=>st.cor)).toBe(true);
  await expect(page.locator('#pad-read')).toHaveText('35');
});

test('Forward after a new trainer returns to the subject chooser',async({page})=>{
  await openGame(page);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('[data-avatar="001"]');
  await page.click('#profile-save');
  await expect(page.getByText('What do you want to practice?')).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.goForward();
  await expect(page.getByText('What do you want to practice?')).toBeVisible();
  await expect(page.locator('.qtext')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.goBack();
  expect(page.url()).not.toContain('index.html');
});

test('Back from an edited name returns to who is playing',async({page})=>{
  await openGame(page);
  await startGame(page,'math');
  await page.click('#who-btn');
  await page.waitForFunction(()=>!navLock);
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.getByRole('button',{name:/^Edit/}).click();
  await expect(page.getByText('Change the name')).toBeVisible();
  await page.fill('#profile-name','Maya');
  await page.goBack();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await expect(page.getByText('Change the name')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByText('Change the name')).toBeVisible();
  await page.fill('#profile-name','Maya');
  await page.click('#profile-save');
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await expect(page.getByText('Maya')).toBeVisible();
  await expect(page.getByText('Change the name')).toHaveCount(0);
  // The form is closed, so Back matches any other stop on who's playing.
  await page.goBack();
  expect(page.url()).not.toContain('index.html');
});
