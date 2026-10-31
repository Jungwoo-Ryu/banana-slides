import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'local-web.spec.ts',workers:1,retries:0,timeout:60000,reporter:'list',
  use:{...devices['Desktop Chrome'],baseURL:process.env.BASE_URL||'http://127.0.0.1:3011',locale:'ko-KR',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
});
