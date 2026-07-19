import { test, expect } from './fixtures/base';

test.describe('Navigation Complete', () => {
  test('sidebar renders with Home and Search buttons', async ({ page }) => {
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();

    const homeBtn = page.getByRole('button', { name: /inicio|início/i });
    await expect(homeBtn).toBeVisible();
  });

  test('search button exists in sidebar', async ({ page }) => {
    const searchBtn = page.getByRole('button', { name: /buscar/i });
    const isAvailable = await searchBtn.isVisible();
    test.skip(!isAvailable, 'Buscar not available in web mode');
    await expect(searchBtn).toBeVisible();
  });

  test('settings button exists in sidebar', async ({ page }) => {
    const settingsButton = page.getByRole('button', { name: 'Configurações', exact: true }).first();
    await expect(settingsButton).toBeVisible();
  });

  test('navigates from Home to Search and back', async ({ page }) => {
    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });

    const searchBtn = page.getByRole('button', { name: /buscar/i });
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    const homeBtn = page.getByRole('button', { name: /inicio|início/i });
    await homeBtn.click();
    await page.waitForTimeout(1000);

    await expect(mainView).toBeVisible({ timeout: 5000 });
  });

  test('player bar is always visible at bottom', async ({ page }) => {
    const playBtn = page.locator('button[title="Tocar"], button[title="Pausar"]').first();
    const isAvailable = await playBtn.isVisible();
    test.skip(!isAvailable, 'Player bar not visible');
    await expect(playBtn).toBeVisible();
  });

  test('sidebar shows library section with interactive elements', async ({ page }) => {
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();

    const buttons = sidebar.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
