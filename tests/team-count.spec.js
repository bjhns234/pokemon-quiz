// Simon should be able to read how many Pokémon he has, in the same words
// every time the team changes: after a catch, after an evolution, and after
// a reset.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');


// Runs inside the page. The Catch button is already the right one to press.
function armCatch(shiny){
  st.phase='wild';
  st.wild={pi:LINES[1][0],level:5,shiny:!!shiny,correctStreak:CATCH_STREAK_NEEDED,misses:0};
  st.cor=true;
  st.tries=1;
  st.wildEscape=false;
  st.q=serveQuestion('math',1,0,PKM[LINES[1][0]].n);
  render();
}

async function pressCatch(page){
  await page.locator('#nxt').click();
  const lbl=page.locator('#catch-lbl');
  await expect(lbl).toContainText(/Gotcha! .+ was caught!/,{timeout:12000});
  return lbl;
}

test('a catch says how many Pokémon he has now',async({page})=>{
  const errors=await openGame(page);
  await startGame(page);
  expect(await state(page,()=>st.team.length)).toBe(1);

  // The starter is set aside after the Catch button is on screen, so this
  // catch is the first Pokémon and the label has to use the singular.
  await state(page,armCatch,false);
  await state(page,()=>{st.team=[];});
  const singular=await pressCatch(page);
  expect(await state(page,()=>st.team.length)).toBe(1);
  await expect(singular).toContainText("That's 1 Pokémon!");
  const caughtName=await state(page,()=>PKM[LINES[1][0]].n);
  const singularSpoken=`Gotcha! ${caughtName} was caught! That's 1 Pokémon!`;
  // One live region, the one already on the page. The on-screen label stays
  // visual, so the sentence is not spoken twice.
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(page.locator('#catch-lbl')).not.toHaveAttribute('aria-live');
  await expect(page.locator('#answer-live')).toHaveText(singularSpoken);
  await expect(page.locator('#catch-overlay')).toBeHidden({timeout:15000});
  await expect(page.locator('#answer-live')).toHaveText(singularSpoken);
  await expect(page.locator('[aria-live]')).toHaveCount(1);

  await state(page,armCatch,true);
  const plural=await pressCatch(page);
  const n=await state(page,()=>st.team.length);
  expect(n).toBe(2);
  await expect(plural).toContainText(`That's ${n} Pokémon!`);
  await expect(plural).not.toContainText("That's 1 Pokémon!");
  await expect(page.locator('#answer-live')).toHaveText(`Gotcha! SHINY ${caughtName} was caught! That's ${n} Pokémon!`);
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  const total=plural.locator('.catch-total');
  await expect(total).toHaveText(`That's ${n} Pokémon!`);
  const totalFont=await total.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(totalFont).toBeGreaterThanOrEqual(14);
  // The overlay is a green gradient, so the check uses its lightest stop.
  const catchRatio=await total.evaluate(el=>{
    function channel(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
    function lum(rgb){return 0.2126*channel(rgb[0])+0.7152*channel(rgb[1])+0.0722*channel(rgb[2]);}
    const m=getComputedStyle(el).color.match(/rgba?\(([^)]+)\)/);
    const p=m[1].split(',').map(s=>parseFloat(s));
    const bg=[42,94,42];
    const L1=lum([p[0],p[1],p[2]]),L2=lum(bg);
    return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
  });
  expect(catchRatio).toBeGreaterThanOrEqual(4.5);

  await expect(page.locator('#catch-overlay')).toBeHidden({timeout:15000});
  await page.click('#nav-pdx');
  await expect(page.locator('#team-tally-n')).toHaveText(`You have ${n} Pokémon!`);
  expect(await state(page,()=>st.team.length)).toBe(n);
  expect(errors).toEqual([]);
});

test('the Pokédex count follows the team through an evolution and a reset',async({page})=>{
  const errors=await openGame(page);
  await startGame(page);
  await page.click('#nav-pdx');
  const tally=page.locator('#team-tally-n');
  await expect(tally).toHaveText('You have 1 Pokémon!');
  await expect(page.locator('#team-tally-shiny')).toHaveCount(0);
  const above=await page.evaluate(()=>{
    const count=document.getElementById('team-tally').getBoundingClientRect();
    const badges=document.querySelector('#pokedex-page .pdx-badges').getBoundingClientRect();
    return count.bottom<=badges.top+1;
  });
  expect(above).toBe(true);

  await state(page,()=>{
    st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:true});
    renderPokedex();
  });
  await expect(tally).toHaveText('You have 2 Pokémon!');
  await expect(page.locator('#team-tally-shiny')).toHaveText('1 is shiny ✨');

  await state(page,()=>{
    st.team.push({pi:LINES[2][0],level:5,xp:0,shiny:true});
    renderPokedex();
  });
  await expect(tally).toHaveText('You have 3 Pokémon!');
  await expect(page.locator('#team-tally-shiny')).toHaveText('2 are shiny ✨');

  const evolved=await state(page,()=>{
    const before=st.team.length;
    const tm=activeTM();
    const from=tm.pi;
    st.pendingEvo={fromPi:from,toPi:from+1};
    processEvolution();
    renderPokedex();
    return {before,after:st.team.length,from,now:activeTM().pi,shiny:!!activeTM().shiny};
  });
  expect(evolved.after).toBe(evolved.before);
  expect(evolved.now).not.toBe(evolved.from);
  await expect(tally).toHaveText(`You have ${evolved.after} Pokémon!`);
  await expect(page.locator('#team-tally-shiny')).toHaveText('2 are shiny ✨');

  await state(page,()=>{resetCurrentProfile();});
  expect(await state(page,()=>st.team.length)).toBe(0);
  await page.click('#nav-pdx');
  await expect(page.locator('#team-tally-n')).toHaveText('You have 0 Pokémon!');
  await expect(page.locator('#team-tally-shiny')).toHaveCount(0);

  await state(page,()=>{pickStarter(0,false);});
  await page.click('#nav-pdx');
  await expect(page.locator('#team-tally-n')).toHaveText('You have 1 Pokémon!');
  expect(await state(page,()=>st.team.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('the switch picker names how many Pokémon he has',async({page})=>{
  const errors=await openGame(page);
  await startGame(page);
  await state(page,()=>{
    st.team.push({pi:LINES[1][0],level:5,xp:0,shiny:false});
    st.phase='switch';
    render();
  });
  await expect(page.locator('#switch-title')).toHaveText('Your 2 Pokémon');
  await expect(page.getByText('Tap one to bring it out')).toBeVisible();

  await state(page,()=>{
    st.team=st.team.slice(0,1);
    render();
  });
  await expect(page.locator('#switch-title')).toHaveText('Your 1 Pokémon');
  await expect(page.getByText('Tap one to bring it out')).toBeVisible();
  expect(errors).toEqual([]);
});
