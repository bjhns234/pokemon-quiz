// The grade pill in the top bar names the level he is playing at.
const {test,expect}=require('@playwright/test');
const {openGame,startGame,state}=require('./helpers');

async function boot(page){
  const errors=await openGame(page);
  await startGame(page);
  return errors;
}

test('the top bar names the grade and follows a tier change',async({page})=>{
  const errors=await boot(page);
  const pill=page.locator('#grade-pill');
  await expect(pill).toHaveText(/Kindergarten/);
  await state(page,()=>{st.stats.math.level=3;render();});
  await expect(pill).toHaveText(/2nd grade/);
  await expect(page.locator('.gym-ring')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the pill fits on a narrow phone without pushing the header',async({page})=>{
  const errors=await boot(page);
  await page.setViewportSize({width:320,height:640});
  await state(page,()=>{st.stats.math.level=1;render();});
  const fit=await state(page,()=>{
    const hdr=document.querySelector('#game .hdr').getBoundingClientRect();
    const pill=document.getElementById('grade-pill').getBoundingClientRect();
    const main=document.getElementById('app-main');
    return {
      inside:pill.right<=hdr.right+1&&pill.left>=hdr.left-1,
      hscroll:main.scrollWidth-main.clientWidth,
      font:parseFloat(getComputedStyle(document.getElementById('grade-pill')).fontSize),
    };
  });
  expect(fit.inside).toBe(true);
  expect(fit.hscroll).toBeLessThanOrEqual(1);
  expect(fit.font).toBeGreaterThanOrEqual(14);
  expect(errors).toEqual([]);
});
