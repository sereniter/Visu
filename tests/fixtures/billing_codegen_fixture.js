/* eslint-disable no-undef */
// Playwright codegen output (simplified) — page/window are browser globals
await page.goto('https://app.anukramai.com/login');
await page.fill('input[name="email"]', 'demo@anukramai.com');
await page.fill('input[name="password"]', 'demo1234');
await page.click('button[type="submit"]');
await page.waitForSelector('.dashboard');
window.__VISU_SCENE_END__ = "s1_login";
await page.click('a[href="/billing"]');
await page.waitForSelector('.billing-dashboard');
window.__VISU_SCENE_END__ = "s2_billing_menu";
