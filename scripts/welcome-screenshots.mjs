// Screenshots of the welcome screen with the sprite CDN allowed.
// Playwright tests abort the network, so this stays out of tests/.
import {chromium} from '@playwright/test';
import {pathToFileURL} from 'url';
import path from 'path';
import {mkdir} from 'fs/promises';

const game=pathToFileURL(path.resolve('index.html')).href;
const out=process.env.WELCOME_SHOTS||'/opt/cursor/artifacts';

const shots=[
  {file:'welcome_768x1024.png',width:768,height:1024},
  {file:'welcome_1024x768.png',width:1024,height:768},
  {file:'welcome_390x844.png',width:390,height:844},
  {file:'welcome_375x667.png',width:375,height:667},
  {file:'welcome_2nd_grade_768x1024.png',width:768,height:1024,grade:3},
  {file:'welcome_shiny_768x1024.png',width:768,height:1024,shiny:true},
];

async function shoot(browser,shot){
  const page=await browser.newPage({viewport:{width:shot.width,height:shot.height}});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(game);
  await page.click('#profile-new');
  await page.fill('#profile-name','Maya');
  await page.click('#profile-next');
  await page.locator('.starter-card').waitFor();
  await page.evaluate(opts=>{
    if(opts.grade!=null)st.grade=opts.grade;
    if(opts.shiny)rollShiny=()=>true;
    playStarterReveal=function(line,shiny,done){done();};
  },{grade:shot.grade??null,shiny:!!shot.shiny});
  await page.click('#pick-0');
  await page.locator('#welcome-overlay.active').waitFor();
  await page.waitForFunction(()=>{
    const img=document.getElementById('welcome-img');
    return img&&img.complete&&img.naturalWidth>0;
  },null,{timeout:20000});
  await page.evaluate(()=>Promise.all(
    [...document.querySelectorAll('#welcome-overlay .welcome-col')]
      .flatMap(el=>el.getAnimations({subtree:true}).map(a=>a.finished))
  ));
  const line=await page.locator('#welcome-line').innerText();
  const src=await page.locator('#welcome-img').getAttribute('src');
  await page.screenshot({path:path.join(out,shot.file)});
  await page.close();
  return {file:shot.file,line,src};
}

const browser=await chromium.launch();
await mkdir(out,{recursive:true});
const results=[];
for(const shot of shots)results.push(await shoot(browser,shot));
await browser.close();
console.log(JSON.stringify(results,null,2));
