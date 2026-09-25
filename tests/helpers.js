const path=require('path');
const {pathToFileURL}=require('url');
const GAME_URL=pathToFileURL(path.join(__dirname,'..','index.html')).href;

// Opens the game with every network request refused, so a run never depends on
// the sprite CDN being up -- a missing sprite is just a broken image. `save`, if
// given, is written to localStorage before the page's own script runs, which is
// how a returning player's session is reproduced.
async function openGame(page,{save}={}){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());
  if(save)await page.addInitScript(s=>{localStorage.setItem('pkq-save',s);},JSON.stringify(save));
  await page.goto(GAME_URL);
  return errors;
}

// Skips the starter screen and the reveal animation: first starter, not shiny,
// then the subject chooser, which is what deals the first question.
async function startGame(page,subject='mix'){
  await page.evaluate(sub=>{pickStarter(0,false);chooseSubject(sub);},subject);
}

// The game's state lives in top-level `let` bindings (st, QB, ...), which page
// functions can name directly. These wrap the calls the tests repeat.
const state=(page,fn,arg)=>page.evaluate(fn,arg);

// Answers the question on screen, skipping the anti-reflex arming pause that
// would otherwise swallow a tap made straight after the question appears.
function answer(page,correct){
  return page.evaluate(ok=>{
    st.armAt=0;
    const i=ok?st.q.correctIndex:st.q.answers.findIndex((_,j)=>j!==st.q.correctIndex&&!st.wrong.includes(j));
    handleAnswer(i);
  },correct);
}

// Deals the next question the way the Next button would, minus the random wild
// encounter roll, so a test decides for itself when an encounter happens.
const nextQuestion=page=>page.evaluate(()=>loadQuestion());

module.exports={GAME_URL,openGame,startGame,state,answer,nextQuestion};

// Puts a specific question on screen, reset exactly as a fresh deal would be.
// Takes its QB address; with no address it finds the first question in `sub`
// whose stem names the Pokemon, for tests about the name being redrawn.
function serve(page,addr){
  return page.evaluate(a=>{
    loadQuestion();
    let {sub,lv,idx}=a;
    if(idx===undefined){
      lv=1;idx=-1;
      for(const l of Object.keys(QB[sub])){idx=QB[sub][l].findIndex(q=>q[0].includes('{P}'));if(idx>=0){lv=+l;break;}}
    }
    // Take it out of the deck the way a real deal does, or the deck could deal it
    // again a few questions later and throw off anything counting servings.
    const deck=QUEUES[sub][lv];const at=deck.indexOf(idx);if(at>=0)deck.splice(at,1);
    st.q=serveQuestion(sub,lv,idx,questionPname());
    render();
    return {sub,lv,idx};
  },addr);
}

// Levels the active Pokemon well past any evolution with a long way to its next
// level, so XP can be read off `xp` without a level-up or evolution interfering.
const pinXp=page=>page.evaluate(()=>{const t=activeTM();t.level=60;t.xp=0;});

module.exports.serve=serve;
module.exports.pinXp=pinXp;
