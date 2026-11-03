// Question variety at kindergarten and 1st grade. Missing a question still
// brings it back as a Rematch after the usual gap, but a run of misses must
// not collapse the game onto those few questions. Past kindergarten, every
// 5th regular question is earlier work, and it still has to be a new question.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

let errors;
test.beforeEach(async({page})=>{
  errors=await openGame(page);
});
test.afterEach(()=>expect(errors,'uncaught page errors').toEqual([]));

function spacing(keys){
  const last=new Map();
  let min=null;
  keys.forEach((k,i)=>{
    if(!last.has(k)){last.set(k,i);return;}
    const d=i-last.get(k);
    if(min==null||d<min)min=d;
    last.set(k,i);
  });
  return {distinct:last.size,min};
}

// `miss` is a first-try wrong answer, then the right one, the way a child
// actually gets to the next question. Level is pinned because three misses
// would otherwise step a 1st-grade player back to kindergarten.
function dealRun(page,level,miss){
  return state(page,({level,miss})=>{
    st.stats.math.level=level;
    st.stats.math.cs=0;
    st.stats.math.ws=0;
    st.badges.math=[];
    st.gymOffer.math=null;
    st.review=[];
    st.seen=[];
    st.lastRematchAt=null;
    st.served=0;
    st.phase='play';
    st.q=null;
    const keys=[];
    let reviews=0;
    for(let i=0;i<20;i++){
      st.stats.math.level=level;
      st.stats.math.ws=0;
      loadQuestion();
      keys.push(reviewKey(st.q.tmpl));
      if(st.q.tmpl.lv!==level){
        // Past kindergarten, every 5th regular question is earlier work.
        // It still has to be a real earlier question, with no label of its own.
        if(!(level>1&&st.q.bankReview&&st.q.tmpl.lv<level))throw new Error('dealt tier '+st.q.tmpl.lv);
        reviews++;
      } else if(st.q.bankReview){
        throw new Error('current tier marked as review');
      }
      st.armAt=0;
      if(miss){
        const wrong=st.q.correctIndex===0?1:0;
        commitAttempt(false,wrong);
      }
      commitAttempt(true,st.q.correctIndex);
    }
    if(level<=1&&reviews)throw new Error('review at kindergarten');
    if(level>1&&reviews!==4)throw new Error('expected 4 reviews, got '+reviews);
    return keys;
  },{level,miss});
}

test('kindergarten and 1st grade each have a deep math bank',async({page})=>{
  const n=await state(page,()=>({k:QB.math[1].length,g:QB.math[2].length}));
  // Was 51 and 53. The extra items stay inside those grades: sums to 5 and
  // counting to 10, then adding and subtracting within 20.
  expect(n.k).toBeGreaterThanOrEqual(80);
  expect(n.g).toBeGreaterThanOrEqual(75);
});

test('20 kindergarten questions are all different when every answer is right',async({page})=>{
  await startGame(page);
  const keys=await dealRun(page,1,false);
  expect(keys).toHaveLength(20);
  expect(spacing(keys)).toEqual({distinct:20,min:null});
});

test('20 first-grade questions are all different when every answer is right',async({page})=>{
  await startGame(page);
  const keys=await dealRun(page,2,false);
  expect(keys).toHaveLength(20);
  expect(spacing(keys)).toEqual({distinct:20,min:null});
});

test('missing every kindergarten question does not collapse onto the same few',async({page})=>{
  await startGame(page);
  const keys=await dealRun(page,1,true);
  const gap=await state(page,()=>REVIEW.gap);
  const got=spacing(keys);
  // A miss still comes back after the gap. It must not come back sooner, and
  // the other slots have to be new questions. Before the fix this run was
  // 4 distinct questions, repeated.
  expect(got.distinct).toBeGreaterThanOrEqual(16);
  expect(got.min).toBeGreaterThanOrEqual(gap);
  for(let i=1;i<keys.length;i++)expect(keys[i],`back to back at ${i}`).not.toBe(keys[i-1]);
});

test('a Gym does not reuse the question that was just on screen',async({page})=>{
  await startGame(page);
  const got=await state(page,()=>{
    const idx=st.q.tmpl.idx;
    const lv=st.q.tmpl.lv;
    st.stats.math.level=lv;
    st.badges.math=st.badges.math.filter(t=>t<lv);
    st.gymOffer.math={tier:lv,cool:0};
    st.cor=true;
    startGym('math');
    return {idx,queue:st.gym.queue.slice(),n:st.gym.queue.length};
  });
  const gymN=await state(page,()=>GYM_QUESTIONS);
  expect(got.n).toBe(gymN);
  expect(got.queue).not.toContain(got.idx);
  expect(new Set(got.queue).size).toBe(got.queue.length);
});

test('reopening the game does not start on the question just shown',async({page})=>{
  await startGame(page);
  const before=await state(page,()=>({
    key:reviewKey(st.q.tmpl),
    level:st.team[0].level,
    xp:st.team[0].xp,
    num:PKM[st.team[0].pi].num,
    best:st.bestStreak,
    tier:st.stats.math.level,
    badges:[...st.badges.math],
  }));
  await state(page,()=>save());
  await page.reload();
  const after=await state(page,()=>({
    key:reviewKey(st.q.tmpl),
    level:st.team[0].level,
    xp:st.team[0].xp,
    num:PKM[st.team[0].pi].num,
    best:st.bestStreak,
    tier:st.stats.math.level,
    badges:[...st.badges.math],
  }));
  expect(after.key).not.toBe(before.key);
  expect(after.level).toBe(before.level);
  expect(after.xp).toBe(before.xp);
  expect(after.num).toBe(before.num);
  expect(after.best).toBe(before.best);
  expect(after.tier).toBe(before.tier);
  expect(after.badges).toEqual(before.badges);
});
