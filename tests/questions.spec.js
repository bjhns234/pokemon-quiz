// Checks on the question bank itself -- the part of the game that changes most.
// Anything here failing means a question would render broken, be unanswerable,
// or give its own answer away.
const {test,expect}=require('@playwright/test');
const {openGame}=require('./helpers');

let QB;
test.beforeAll(async({browser})=>{
  const page=await browser.newPage();
  await openGame(page);
  // Functions don't survive the trip out of the page, but the bank is plain data.
  QB=await page.evaluate(()=>QB);
  await page.close();
});

// Every question in the bank, with an address that's readable in a failure message.
function all(){
  const out=[];
  for(const sub of Object.keys(QB))
    for(const lv of Object.keys(QB[sub]))
      QB[sub][lv].forEach((q,i)=>out.push({at:`${sub} tier ${lv} #${i} "${q[0]}"`,sub,lv,q}));
  return out;
}
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const hasWord=(text,word)=>new RegExp(`(^|[^A-Za-z0-9])${escapeRe(word)}($|[^A-Za-z0-9])`,'i').test(text);

test('every subject has questions at every tier from 1 up',()=>{
  for(const sub of ['math','reading','science']){
    const tiers=Object.keys(QB[sub]).map(Number).sort((a,b)=>a-b);
    expect(tiers[0],sub).toBe(1);
    tiers.forEach((t,i)=>{
      expect(t,`${sub} skips a tier`).toBe(i+1);
      expect(QB[sub][t].length,`${sub} tier ${t} is empty`).toBeGreaterThan(0);
    });
  }
});

test('every question has a stem, 4 options, a valid answer, a cheer and a hint',()=>{
  for(const {at,q} of all()){
    expect(q,at).toHaveLength(5);
    const [stem,opts,idx,cheer,hint]=q;
    for(const s of [stem,cheer,hint])expect(typeof s==='string'&&s.trim().length>0,at).toBe(true);
    expect(opts,at).toHaveLength(4);
    for(const o of opts)expect(typeof o==='string'&&o.trim().length>0,at).toBe(true);
    expect(Number.isInteger(idx)&&idx>=0&&idx<opts.length,`${at}: answer index ${idx}`).toBe(true);
  }
});

// Case-sensitive on purpose: the capital-letter questions ("the bird flew." vs
// "The bird flew.") are options that differ only in case.
test('no question offers the same option twice',()=>{
  for(const {at,q} of all())expect(new Set(q[1]).size,at).toBe(q[1].length);
});

test('the only placeholder is {P}',()=>{
  for(const {at,q} of all()){
    const text=[q[0],...q[1],q[3],q[4]].join(' ');
    expect(text.replace(/\{P\}/g,''),at).not.toMatch(/[{}]/);
  }
});

// The hint can be read BEFORE answering (Ask for help), so it must never just
// hand over the answer. Two exemptions: a question whose own text already names
// the answer (sight words -- "Which word is THE?"), where the hint can't make it
// any more given away; and one-character answers, which turn up incidentally in
// counting strategies ("Count back 2 from 4!").
test('no hint gives away its answer',()=>{
  for(const {at,q} of all()){
    const ans=q[1][q[2]];
    if(ans.length<2||hasWord(q[0],ans))continue;
    expect(hasWord(q[4],ans),`${at}: hint "${q[4]}" contains the answer "${ans}"`).toBe(false);
  }
});

// A saved Rematch is looked up by tier + index and then checked against the
// question text, so two identical questions in one tier would be indistinguishable.
test('no tier has the same question twice',()=>{
  for(const sub of Object.keys(QB))for(const lv of Object.keys(QB[sub])){
    const seen=new Map();
    QB[sub][lv].forEach((q,i)=>{
      const sig=q[0]+' | '+[...q[1]].sort().join(' / ');
      expect(seen.has(sig),`${sub} tier ${lv} #${i} repeats #${seen.get(sig)}`).toBe(false);
      seen.set(sig,i);
    });
  }
});
