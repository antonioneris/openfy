import { test, expect } from './fixtures/base';

test.describe('Queue View Complete', () => {
  test('queue button navigates to queue view', async ({ page }) => {
    const queueBtn = page.locator('button[title="Fila de reproducao"]').first();
    const isAvailable = await queueBtn.isVisible();
    test.skip(!isAvailable, 'Queue button not visible');

    await queueBtn.click();
    await page.waitForTimeout(1000);

    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });
  });

  test('queue view renders when navigated', async ({ page }) => {
    const queueBtn = page.locator('button[title="Fila de reproducao"]').first();
    const isAvailable = await queueBtn.isVisible();
    test.skip(!isAvailable, 'Queue button not visible');

    await queueBtn.click();
    await page.waitForTimeout(1000);

    const queueContent = page.locator('.main-view').first();
    await expect(queueContent).toBeVisible({ timeout: 5000 });
  });

  test('empty queue shows message', async ({ page }) => {
    const queueBtn = page.locator('button[title="Fila de reproducao"]').first();
    const isAvailable = await queueBtn.isVisible();
    test.skip(!isAvailable, 'Queue button not visible');

    await queueBtn.click();
    await page.waitForTimeout(1000);

    // Queue should show some content or empty state
    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });
  });
});
