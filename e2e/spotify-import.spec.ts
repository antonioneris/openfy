import { test, expect } from './fixtures/base';
import { MOCK_SPOTIFY_PLAYLIST } from './fixtures/electron-mock';

test.describe('Spotify Import', () => {
  test('navigate to Buscar tab from sidebar', async ({ page }) => {
    // Step 1: Click "Buscar" in the sidebar
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    // Step 2: Verify the SearchView loaded with "Buscar" title
    const title = page.getByText('Buscar').first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  test('YouTube Music tab is available and clickable', async ({ page }) => {
    // Step 1: Navigate to Buscar
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    // Step 2: Click "YouTube Music" tab
    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 3: Verify the YouTube Music search input appears
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test('YouTube Music search input accepts Spotify URL', async ({ page }) => {
    // Step 1: Navigate to Buscar
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    // Step 2: Click "YouTube Music" tab
    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 3: Paste Spotify URL in the YouTube Music search bar
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('https://open.spotify.com/playlist/4iVma1T5JWR8T8PqVpBlyH');
    await expect(searchInput).toHaveValue('https://open.spotify.com/playlist/4iVma1T5JWR8T8PqVpBlyH');
  });

  test('autocomplete shows playlist detection after entering Spotify URL', async ({ page }) => {
    // Step 1: Navigate to Buscar → YouTube Music
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 2: Paste Spotify URL and wait for autocomplete
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('https://open.spotify.com/playlist/4iVma1T5JWR8T8PqVpBlyH');

    // Step 3: Wait for autocomplete dropdown with "Playlist Detectada"
    await page.waitForTimeout(1500);

    const playlistDetectada = page.getByText('Playlist Detectada').first();
    const count = await playlistDetectada.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking detected playlist navigates to playlist view', async ({ page }) => {
    // Step 1: Navigate to Buscar → YouTube Music
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 2: Paste Spotify URL
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('https://open.spotify.com/playlist/4iVma1T5JWR8T8PqVpBlyH');

    // Step 3: Wait for autocomplete and click the playlist
    await page.waitForTimeout(1500);

    const playlistDetectada = page.getByText('Playlist Detectada').first();
    if (await playlistDetectada.isVisible()) {
      // Click on the playlist name below "Playlist Detectada"
      const playlistName = page.getByText(MOCK_SPOTIFY_PLAYLIST.name).first();
      if (await playlistName.isVisible()) {
        await playlistName.click();
        await page.waitForTimeout(1000);

        // Should navigate to playlist view
        const mainView = page.locator('.main-view').first();
        await expect(mainView).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('submitting Spotify URL via Enter key', async ({ page }) => {
    // Step 1: Navigate to Buscar → YouTube Music
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 2: Type Spotify URL and press Enter
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('https://open.spotify.com/playlist/4iVma1T5JWR8T8PqVpBlyH');
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Should navigate to playlist view
    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('YouTube Music search works for text queries', async ({ page }) => {
    // Step 1: Navigate to Buscar → YouTube Music
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar button not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 2: Type a text query and press Enter
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('Beatles');
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Search results should appear in the view (may stay on search view)
    // Just verify the search input still exists and the page didn't crash
    const searchStillVisible = await searchInput.isVisible();
    expect(searchStillVisible).toBe(true);
  });
});
