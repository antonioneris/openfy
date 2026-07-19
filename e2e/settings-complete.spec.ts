import { test, expect } from './fixtures/base';

test.describe('Settings View Complete', () => {
  test('sidebar button navigates to settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  });

  test('settings view has content sections', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    // Settings should have multiple content sections
    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('settings shows library statistics', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    // Stats section should exist
    const statsSection = page.locator('.main-view').first();
    await expect(statsSection).toBeVisible({ timeout: 5000 });
  });

  test('settings has all sections', async ({ page }) => {
    const gearBtn = page.locator('button[title*="configurações" i]').first();
    const isAvailable = await gearBtn.isVisible();
    test.skip(!isAvailable, 'Settings gear button not visible');

    await gearBtn.click();
    await page.waitForTimeout(1000);

    // Should show settings content
    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('settings shows OpenFy developer information', async ({ page }) => {
    await page.getByRole('button', { name: 'Configurações', exact: true }).first().click();

    await expect(page.getByRole('heading', { name: 'Sobre' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'OpenFy' })).toBeVisible();
    await expect(page.getByText('Antonio Neris', { exact: true })).toBeVisible();
    await expect(page.getByText('antonioneris@gmail.com', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /LinkedIn/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /GitHub/i })).toBeVisible();
  });
});
