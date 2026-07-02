const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
    page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
    
    console.log("Navigating to page...");
    await page.goto('https://lms-portal-amber-five.vercel.app/admin/students', { waitUntil: 'networkidle0' });
    
    console.log("Waiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));
    
    console.log("Done.");
    await browser.close();
  } catch (e) {
    console.error("Puppeteer script failed:", e);
  }
})();
