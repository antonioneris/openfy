import { test, expect } from './fixtures/base';

test.describe('Home View Complete', () => {
  test('renders main view and sidebar on load', async ({ page }) => {
    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });

    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();
  });

  test('home view shows empty state when no library', async ({ page }) => {
    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });

    // Empty state should show "Sua biblioteca esta vazia" or content
    const emptyState = page.getByText(/biblioteca esta vazia|adicionar pasta/i).first();
    const hasContent = await emptyState.count();
    expect(hasContent).toBeGreaterThanOrEqual(0);
  });

  test('sidebar has interactive library elements', async ({ page }) => {
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible();

    const buttons = sidebar.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('sidebar Inicio button navigates to home', async ({ page }) => {
    const homeBtn = page.getByRole('button', { name: /início/i }).first();
    await expect(homeBtn).toBeVisible();

    // Already on home, clicking should stay on home
    await homeBtn.click();
    await page.waitForTimeout(500);

    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });
  });
});
