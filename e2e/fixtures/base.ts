import { test as base, expect } from '@playwright/test';
import { ELECTRON_API_SCRIPT } from './electron-mock';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject the Electron API mock before any navigation
    await page.addInitScript(ELECTRON_API_SCRIPT);

    // Navigate to app
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for app container to appear
    await page.waitForSelector('.app-container', { timeout: 20000 });

    // Small delay for React to fully render
    await page.waitForTimeout(1000);

    await use(page);
  },
});

export { expect } from '@playwright/test';
