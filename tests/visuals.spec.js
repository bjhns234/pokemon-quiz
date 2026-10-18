// Picture hints sit beside the text hint. They restate the stem as something a
// kid can count, and they must not print the answer or change how a question scores.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state,answer,pinXp}=require('./helpers');

let errors;
test.beforeEach(async({page})=>{
  errors=await openGame(page);
  await startGame(page);
});
test.afterEach(()=>expect(errors,'uncaught page errors').toEqual([]));

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
        st.tries=0;st.wrong=[];st.lastXp=0;st.armAt=0;st.wildEscape=false;
        render();
        return true;
      }
    return false;
  },needle).then(found=>{
    expect(found,`no question stem contains ${JSON.stringify(needle)}`).toBe(true);
  });
}

test('counting the picture reaches the answer, and the picture never prints a digit',async({page})=>{
  const report=await page.evaluate(()=>{
    const problems=[];
    const counts={add:0,sub:0,mul:0,div:0,cmp:0,missing:0};
    const shown=[];
    const bare=(stem,re,ok)=>{
      const m=stem.match(re);
      if(!m)return;
      const a=+m[1],b=+m[2];
      return ok(a,b);
    };
    for(const sub of Object.keys(QB))
      for(const lv of Object.keys(QB[sub]))
        QB[sub][lv].forEach((raw,idx)=>{
          const order=raw[1].map((_,i)=>i);
          const q=fillQuestion({sub,lv:+lv,idx,raw,order,cheer:raw[3]},'Pikachu');
          const html=visualHintHTML(q);
          const stem=raw[0];
          if(sub!=='math'){
            if(html)problems.push(`${sub} got a picture: ${stem}`);
            return;
          }
          const spec=mathVisualSpec(q);
          if(!spec!==!html)problems.push(`spec/html mismatch: ${stem}`);
          const plus=bare(stem,/^What is (\d+) \+ (\d+)\?$/, (a,b)=>a+b>0&&a+b<=20);
          const minus=bare(stem,/^What is (\d+) - (\d+)\?$/, (a,b)=>b<=a&&a<=20);
          if(plus!==undefined&&plus!==!!html)problems.push(`bare add picture ${!!html} but expected ${plus}: ${stem}`);
          if(minus!==undefined&&minus!==!!html)problems.push(`bare sub picture ${!!html} but expected ${minus}: ${stem}`);
          if(/Start at \d+ and count up/i.test(stem)&&html)problems.push(`count-up drew a picture: ${stem}`);
          if(/\bmiles?\b/i.test(stem)&&(!spec||spec.item!=='mile'))problems.push(`miles drawn as ${spec?spec.item:'nothing'}: ${stem}`);
          if(!html)return;
          counts[spec.op]=(counts[spec.op]||0)+1;
          shown.push(`${spec.op} ${spec.item} | ${stem}`);
          const host=document.createElement('div');
          host.innerHTML=html;
          const text=host.textContent||'';
          if(/\d/.test(text))problems.push(`digit in picture text "${text}" for ${stem}`);
          const ans=q.answers[q.correctIndex];
          const root=host.querySelector('.hint-visual');
          if(root.dataset.kind!==spec.op)problems.push(`kind ${root.dataset.kind} != ${spec.op}: ${stem}`);
          if(root.dataset.item!==spec.item)problems.push(`item ${root.dataset.item} != ${spec.item}: ${stem}`);
          const bright=host.querySelectorAll('.hv-mark:not(.gone)').length;
          const gone=host.querySelectorAll('.hv-mark.gone').length;
          if(spec.op==='add'||spec.op==='sub'||spec.op==='mul'){
            if(!/^\d+$/.test(ans))problems.push(`non-numeric answer "${ans}" for ${spec.op}: ${stem}`);
            else if(bright!==+ans)problems.push(`${spec.op} counts to ${bright}, answer is ${ans}: ${stem}`);
          }
          if(spec.op==='add'&&(gone!==0||bright!==spec.a+spec.b))problems.push(`add groups ${spec.a}+${spec.b} rendered ${bright}/${gone}: ${stem}`);
          if(spec.op==='sub'&&(gone!==spec.b||bright+gone!==spec.a))problems.push(`sub ${spec.a}-${spec.b} rendered bright ${bright} gone ${gone}: ${stem}`);
          if(spec.op==='add'&&(spec.a===0||spec.b===0)&&host.querySelector('.hv-empty'))
            problems.push(`zero addend drew an empty box: ${stem}`);
          if(spec.op==='sub'&&spec.b===0){
            if(gone!==0)problems.push(`subtracting zero crossed icons: ${stem}`);
            if(/Skip the crossed/.test(text))problems.push(`subtracting zero says to skip crossed ones: ${stem}`);
          }
          if(spec.op==='mul'){
            const groups=[...host.querySelectorAll('[data-group]')];
            if(groups.length!==spec.a||groups.some(g=>g.querySelectorAll('.hv-mark').length!==spec.b))
              problems.push(`mul ${spec.a} groups of ${spec.b} rendered wrong: ${stem}`);
            if(host.querySelector('.hv-count'))problems.push(`multiplication outlined a group: ${stem}`);
          }
          if(spec.op==='div'){
            if(!/^\d+$/.test(ans))problems.push(`non-numeric div answer "${ans}": ${stem}`);
            const groups=[...host.querySelectorAll('[data-group]')];
            if(!groups.length||groups.some(g=>g.querySelectorAll('.hv-mark').length!==+ans)||groups.length!==spec.b)
              problems.push(`div ${spec.a}/${spec.b} groups don't each count to ${ans}: ${stem}`);
            const outlined=[...host.querySelectorAll('.hv-count')];
            if(outlined.length!==1)problems.push(`div outlined ${outlined.length} groups: ${stem}`);
            else if(outlined[0].querySelectorAll('.hv-mark').length!==+ans)
              problems.push(`outlined group is not the answer: ${stem}`);
            if(!/outlined group/.test(text))problems.push(`div caption "${text}": ${stem}`);
          }
          if(host.querySelector('.tf-cell.slot')){
            if(host.querySelector('.tf-cell.empty'))problems.push(`make-10 uses hole cells: ${stem}`);
            const start=Math.max(spec.a,spec.b),add=Math.min(spec.a,spec.b);
            const bridge=Math.min(10-start,add),extra=add-bridge;
            const want=`Make 10 first: ${start} + ${bridge} = 10. Then add the ${extra} that ${extra===1?'is':'are'} left.`;
            if(q.hint!==want)problems.push(`hint "${q.hint}" != "${want}": ${stem}`);
            if(!/lined boxes are spaces/.test(text))problems.push(`make-10 caption "${text}": ${stem}`);
            const slots=host.querySelectorAll('.tf-cell.slot').length;
            const bridgeMarks=host.querySelectorAll('.hv-bridge .hv-mark').length;
            if(slots!==bridge||bridgeMarks!==bridge)problems.push(`slots ${slots} bridge marks ${bridgeMarks} expected ${bridge}: ${stem}`);
          }
          if(spec.op==='missing'&&host.querySelector('.tf-cell.slot'))
            problems.push(`missing-number uses make-10 trays: ${stem}`);
          if(spec.op==='missing'){
            const empty=host.querySelectorAll('.tf-cell.empty').length;
            const filled=host.querySelectorAll('.ten-frame .hv-mark').length;
            if(empty!==+ans||filled!==spec.have||empty+filled!==10)
              problems.push(`missing have ${spec.have} shows ${filled} filled / ${empty} empty, answer ${ans}: ${stem}`);
          }
          if(spec.op==='cmp'){
            const sides=[...host.querySelectorAll('.hv-side')].map(s=>s.querySelectorAll('.hv-mark').length);
            if(sides[0]!==spec.a||sides[1]!==spec.b)problems.push(`compare sides ${sides} != ${spec.a}, ${spec.b}: ${stem}`);
            if(+ans!==spec.a&&+ans!==spec.b)problems.push(`compare answer ${ans} is not a side: ${stem}`);
          }
          if(spec.op!=='cmp'&&spec.op!=='missing'&&!/^\d+$/.test(ans))
            problems.push(`picture on a non-count answer "${ans}": ${stem}`);
        });
    return {problems,counts,shown};
  });
  expect(report.problems,report.shown.join('\n')).toEqual([]);
  expect(report.counts.add).toBeGreaterThan(20);
  expect(report.counts.sub).toBeGreaterThan(10);
  expect(report.counts.mul).toBeGreaterThan(5);
  expect(report.counts.div).toBeGreaterThan(5);
  expect(report.counts.cmp).toBeGreaterThan(5);
  expect(report.counts.missing).toBeGreaterThan(0);
});

test('stories that are not a single count stay text-only',async({page})=>{
  const stems=[
    'The clock says 3:30',
    'had 20 berries, ate 5, then found 8',
    'What is 5 x 5?',
    'shares 10 berries with 1 friend',
    'Which 3D shape looks like a globe?',
    'How many minutes are in HALF an hour?',
    'What letter does CAT start with?',
    'Start at 16 and count up',
  ];
  for(const stem of stems){
    await serveStem(page,stem);
    await state(page,()=>askForHelp());
    await expect(page.locator('.help-box')).toBeVisible();
    await expect(page.locator('.hint-visual')).toHaveCount(0);
  }
});

test('asking for help shows a berry picture with the text hint',async({page})=>{
  await serveStem(page,'has 2 berries. Gets 3 more');
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  const hint=await state(page,()=>st.q.hint);
  await page.click('#help-btn');
  const box=page.locator('.help-box');
  await expect(box).toContainText(hint);
  const visual=box.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-kind','add');
  await expect(visual).toHaveAttribute('data-item','berry');
  await expect(visual.locator('.ten-frame')).toHaveCount(0);
  await expect(visual.locator('.hv-mark')).toHaveCount(5);
  await expect(visual.locator('.hv-mark.gone')).toHaveCount(0);
  await expect(visual).toContainText('Count every one.');
  await expect(page.locator('#help-btn')).toHaveCount(0);
});

test('a small subtraction crosses out the ones that were taken',async({page})=>{
  await serveStem(page,'had 5 berries and ate 3');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-kind','sub');
  await expect(visual).toHaveAttribute('data-item','berry');
  await expect(visual.locator('.hv-mark')).toHaveCount(5);
  await expect(visual.locator('.hv-mark.gone')).toHaveCount(3);
  await expect(visual.locator('.hv-mark:not(.gone)')).toHaveCount(2);
  await expect(visual).toContainText('Skip the crossed-out ones.');
});

test('a Poke Ball story uses Poke Balls',async({page})=>{
  await serveStem(page,'has 3 Poke Balls');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-item','ball');
  await expect(visual).toHaveAttribute('data-kind','add');
  await expect(visual.locator('.hv-mark')).toHaveCount(5);
});

test('a teen subtraction uses a ten-frame and takes the extras first',async({page})=>{
  await serveStem(page,'What is 14 - 6?');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-kind','sub');
  await expect(visual.locator('.ten-frame')).toHaveCount(1);
  // 4 loose ones, all crossed, then 2 more from the frame. 8 bright ones left to count.
  await expect(visual.locator('.hv-ones .hv-mark')).toHaveCount(4);
  await expect(visual.locator('.hv-ones .hv-mark.gone')).toHaveCount(4);
  await expect(visual.locator('.ten-frame .hv-mark.gone')).toHaveCount(2);
  await expect(visual.locator('.ten-frame .hv-mark:not(.gone)')).toHaveCount(8);
  const hint=await state(page,()=>st.q.hint);
  await expect(page.locator('.help-say')).toContainText(hint);
});

test('taking from 20 crosses out one frame and leaves the other',async({page})=>{
  await serveStem(page,'had 20 berries and ate 6');
  await page.click('#help-btn');
  const frames=page.locator('.hint-visual .ten-frame');
  await expect(frames).toHaveCount(2);
  await expect(frames.nth(0).locator('.gone')).toHaveCount(0);
  await expect(frames.nth(1).locator('.gone')).toHaveCount(6);
  await expect(page.locator('.hint-visual .hv-mark:not(.gone)')).toHaveCount(14);
});

test('a make-10 addition uses lined spaces, not holes to count',async({page})=>{
  await serveStem(page,'has 7 berries and finds 5 more');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-kind','add');
  await expect(visual.locator('.tf-cell.slot')).toHaveCount(3);
  await expect(visual.locator('.tf-cell.empty')).toHaveCount(0);
  await expect(visual.locator('.hv-bridge .hv-mark')).toHaveCount(3);
  await expect(visual.locator('.hv-extra .hv-mark')).toHaveCount(2);
  await expect(visual.locator('.hv-mark')).toHaveCount(12);
  await expect(visual).toContainText('Count the berries. The lined boxes are spaces those berries fill.');
  await expect(page.locator('.help-say')).toContainText('Make 10 first: 7 + 3 = 10. Then add the 2 that are left.');
});

test('every subtraction the picture allows counts to the difference',async({page})=>{
  const problems=await page.evaluate(()=>{
    const problems=[];
    for(let a=0;a<=20;a++)for(let b=0;b<=a;b++){
      const spec={op:'sub',a,b,item:'berry'};
      if(!visualFits(spec)){problems.push(`visualFits rejected ${a}-${b}`);continue;}
      const host=document.createElement('div');
      host.innerHTML=renderMathVisual(spec);
      const bright=host.querySelectorAll('.hv-mark:not(.gone)').length;
      const gone=host.querySelectorAll('.hv-mark.gone').length;
      if(bright!==a-b||gone!==b)problems.push(`${a}-${b} bright ${bright} gone ${gone}`);
    }
    const host=document.createElement('div');
    host.innerHTML=renderMathVisual({op:'sub',a:20,b:12,item:'berry'});
    const frames=[...host.querySelectorAll('.ten-frame')];
    if(frames.length!==2)problems.push(`20-12 frames ${frames.length}`);
    else{
      const g0=frames[0].querySelectorAll('.gone').length;
      const g1=frames[1].querySelectorAll('.gone').length;
      if(g0!==2||g1!==10)problems.push(`20-12 crossed ${g0} then ${g1}`);
    }
    return problems;
  });
  expect(problems).toEqual([]);
});

test('division outlines the one group to count',async({page})=>{
  await serveStem(page,'What is 20 divided by 4?');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await expect(visual.locator('.hv-count')).toHaveCount(1);
  await expect(visual.locator('.hv-count .hv-mark')).toHaveCount(5);
  await expect(visual.locator('[data-group]')).toHaveCount(4);
  await expect(visual).toContainText('Count the outlined group.');
});

test('make-10 with an empty ten-frame counts the holes, not the berries he already has',async({page})=>{
  await serveStem(page,'needs 10 berries but only has 6');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-kind','missing');
  await expect(visual.locator('.tf-cell.empty')).toHaveCount(4);
  await expect(visual.locator('.hv-mark')).toHaveCount(6);
  await expect(visual).toContainText('Count the empty spots.');
});

test('a miss shows the same picture under the text hint',async({page})=>{
  await pinXp(page);
  await serveStem(page,'What is 4 - 2?');
  await state(page,()=>{st.streak=4;});
  const hint=await state(page,()=>st.q.hint);
  await answer(page,false);
  await expect(page.locator('.result-msg')).toContainText(hint);
  const visual=page.locator('.hint-visual');
  await expect(visual).toHaveAttribute('data-kind','sub');
  await expect(visual.locator('.hv-mark')).toHaveCount(4);
  await expect(visual.locator('.hv-mark.gone')).toHaveCount(2);
  await expect(page.locator('.help-box')).toHaveCount(0);
  // Landing it afterwards still pays the after-hint rate and does not rebuild the streak.
  await answer(page,true);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>XP_AFTER_HINT));
  expect(await state(page,()=>st.streak)).toBe(0);
  await expect(page.locator('.hint-visual')).toHaveCount(0);
});

test('asking does not change the help rate, and a correct answer clears the picture',async({page})=>{
  await pinXp(page);
  await serveStem(page,'What is 2 + 2?');
  await state(page,()=>{st.streak=3;});
  await page.click('#help-btn');
  await expect(page.locator('.hint-visual')).toBeVisible();
  await answer(page,true);
  expect(await state(page,()=>st.streak)).toBe(3);
  expect(await state(page,()=>st.lastXp)).toBe(await state(page,()=>XP_WITH_HELP));
  await expect(page.locator('.hint-visual')).toHaveCount(0);
});

test('a wild miss shows the picture and a flee does not',async({page})=>{
  await state(page,()=>{st.cor=true;triggerWildEncounter(false);});
  await serveStem(page,'What is 1 + 1?');
  expect(await state(page,()=>st.phase)).toBe('wild');
  await answer(page,false);
  await expect(page.locator('.hint-visual')).toBeVisible();
  await expect(page.locator('.hint-visual .hv-mark')).toHaveCount(2);
  await state(page,()=>{st.wildEscape=true;st.cor=false;render();});
  await expect(page.locator('.hint-visual')).toHaveCount(0);
  await expect(page.locator('.result-msg')).toContainText('ran away');
});

test('the picture fits a phone-width screen',async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await serveStem(page,'had 20 berries and ate 6');
  await page.click('#help-btn');
  const visual=page.locator('.hint-visual');
  await visual.scrollIntoViewIfNeeded();
  const box=await visual.boundingBox();
  const card=await page.locator('.card').last().boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(card.width+1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
