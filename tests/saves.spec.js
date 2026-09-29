// Loading saves written by older versions of the game. The save format has grown
// fields without bumping SAVE_V, so each of these has to keep loading as-is --
// bumping it would wipe a kid's Pokedex.
const {test,expect}=require('@playwright/test');
const {openGame,state}=require('./helpers');

const base={v:1,starter:0,activeIdx:0,team:[{num:'#001',level:7,xp:3}],dex:['#001'],
  stats:{math:{cor:5,att:6,level:2,cs:1,ws:0},reading:{cor:0,att:0,level:1,cs:0,ws:0},science:{cor:0,att:0,level:1,cs:0,ws:0}}};

test('a save from before subjects, records, shinies and Rematches still loads',async({page})=>{
  const errors=await openGame(page,{save:base});
  const s=await state(page,()=>({phase:st.phase,team:st.team.map(t=>[PKM[t.pi].num,t.level,!!t.shiny]),subject:st.subject,best:st.bestStreak,review:st.review,math:st.stats.math.level,hasQ:!!st.q}));
  expect(s).toEqual({phase:'play',team:[['#001',7,false]],subject:'mix',best:0,review:[],math:2,hasQ:true});
  expect(errors).toEqual([]);
});

test('a saved Rematch whose question was edited is dropped, not remapped',async({page})=>{
  const good=await (async()=>{await openGame(page);return state(page,()=>QB.math[1][0][0]);})();
  const save={...base,review:[
    {sub:'math',lv:1,idx:0,q:good,wins:1},
    {sub:'math',lv:1,idx:1,q:'a question that has since been rewritten',wins:0},
    {sub:'math',lv:99,idx:0,q:'a tier that no longer exists',wins:0},
  ]};
  const p2=await page.context().newPage();
  const errors=await openGame(p2,{save});
  expect(await state(p2,()=>st.review.map(r=>[reviewKey(r),r.wins]))).toEqual([['math/1/0',1]]);
  expect(errors).toEqual([]);
});

test('a corrupt save starts a fresh game instead of a blank screen',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('pkq-save','{not json'));
  const errors=await openGame(page);
  expect(await state(page,()=>st.phase)).toBe('starter');
  expect(errors).toEqual([]);
});

// Older versions let a wild encounter hand him a second copy of a family he
// already had. On load, one per family and colour survives: the highest level.
test('duplicate Pokemon in a save are merged down to one per family and colour',async({page})=>{
  const save={...base,activeIdx:3,team:[
    {num:'#001',level:7,xp:3},
    {num:'#058',level:20,xp:0},              // Growlithe that would grow into a second Arcanine
    {num:'#059',level:40,xp:5},              // the best regular Arcanine
    {num:'#059',level:35,xp:0},              // the active one, a duplicate
    {num:'#059',level:12,xp:0,shiny:true},   // a shiny is its own thing and stays
  ]};
  const errors=await openGame(page,{save});
  const s=await state(page,()=>({team:st.team.map(t=>[PKM[t.pi].num,t.level,!!t.shiny]),active:PKM[activeTM().pi].num+'/'+activeTM().level}));
  expect(s.team).toEqual([['#001',7,false],['#059',40,false],['#059',12,true]]);
  expect(s.active).toBe('#059/40');
  expect(errors).toEqual([]);
});
