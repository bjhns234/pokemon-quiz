// The game is one static file, so there is no server to start: each test opens
// index.html straight off disk (see tests/helpers.js).
const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests',
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  reporter:process.env.CI?[['list'],['github']]:'list',
  // A failure in CI keeps a trace (open it with `npx playwright show-trace`).
  use:{...devices['iPad Mini'],browserName:'chromium',trace:'retain-on-failure'},
});
