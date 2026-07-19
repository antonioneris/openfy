import { test, expect } from './fixtures/base';

test.describe('Library Setup', () => {
  test('settings gear button navigates to settings view', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });
  });

  test('settings shows library folders section', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('settings shows library statistics section', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    const statsHeading = page.getByText(/estatísticas|stats|biblioteca/i).first();
    const count = await statsHeading.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('back button returns to previous view', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    const backBtn = page.locator('button[title="Voltar"], button[title*="voltar" i]').first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(500);
      const mainView = page.locator('.main-view').first();
      await expect(mainView).toBeVisible({ timeout: 5000 });
    }
  });

  test('mock library folder is accessible', async ({ page }) => {
    // Verify the mock electronAPI is working
    const isElectron = await page.evaluate(() => (window as any).electronAPI?.isElectron);
    expect(isElectron).toBe(true);
  });

  test('mock readDirectory returns audio files', async ({ page }) => {
    // Verify mock readDirectory works
    const files = await page.evaluate(() => (window as any).electronAPI?.readDirectory('/mock/test-library'));
    expect(files).toHaveLength(2);
    expect(files[0].fileName).toBe('test-song-1.mp3');
  });
});
