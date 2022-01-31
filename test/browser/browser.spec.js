/*

TODO: right now, if this is under ./test/. directly, mocha picks it up and it fails
      by putting it into a sub directory, I can keep it separate for playwright test
      however, it would be nice if playwright/test works directly with mocha
      but right now that doesn't look possible

TODO: can we set this up to trigger local configurations for starting a
      webServer rather than in playwright.config.js?

TODO: add some navigation checks... click around a bit.
*/
const { test, expect } = require('@playwright/test')
// test.use({
//   webServer: {
//     command: 'npm run start',
//     timeout: 120 * 1000
//   },
//   use: {
//     baseURL: 'http://localhost:8080/',
//   },
// });

test.describe('check main site', () => {
  [
    '/',
    '/contact/',
    '/about/who-we-are/',
    '/about/key-information/',
    '/about/incidents/',
    '/about/governance/',
    '/news/',
    '/news/2021-11-01-welcome-from-the-chief/',
    '/services/emergency-services/',
    '/services/burn-permits/',
    '/services/firewise/',
    '/services/knoxbox/',
    '/services/fire-alarms/'
  ].forEach(path => {
    test(`${path} page successfully loads`, async ({ page, baseURL }) => {
      page.on('pageerror', exception => {
        console.log(`Uncaught exception: "${exception}"`)
      })
      // Listen for all console logs
      // page.on('console', msg => console.log(msg.text()))

      // Listen for all console events and handle errors
      page.on('console', msg => {
        if (msg.type() === 'error') { console.log(`** JS Error: "${msg.text()}"`) }
      })
      const response = await page.goto(path)
      expect(response.ok()).toBeTruthy()
    })
  })

  // test('landing page', async ({ page }) => {
  //   page.on('pageerror', exception => {
  //     console.log(`Uncaught exception: "${exception}"`);
  //   });
  //   // Listen for all console logs
  //   page.on('console', msg => console.log(msg.text()))

  //   // Listen for all console events and handle errors
  //   page.on('console', msg => {
  //     if (msg.type() === 'error')
  //       console.log(`Error text: "${msg.text()}"`);
  //   });
  //   await page.goto('/');
  // });
})
