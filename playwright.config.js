// playwright.config.js
// @ts-check
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  webServer: {
    command: "npm run start",
    port: 8080,
    timeout: 120 * 1000,
    // reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:8080/",
    screenshot: "only-on-failure",
  },
};
module.exports = config;
