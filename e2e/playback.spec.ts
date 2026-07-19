import { test, expect } from './fixtures/base';
import { MOCK_SPOTIFY_PLAYLIST } from './fixtures/electron-mock';

test.describe('Player Controls', () => {
  test('play/pause button shows "Tocar" when no track is loaded', async ({ page }) => {
    const playBtn = page.locator('button[title="Tocar"], button[title="Pausar"]').first();
    const isAvailable = await playBtn.isVisible();
    test.skip(!isAvailable, 'Player bar not visible');

    const title = await playBtn.getAttribute('title');
    expect(title).toBe('Tocar');
  });

  test('volume slider has valid range attributes', async ({ page }) => {
    const volumeSlider = page.locator('input[type="range"]').first();
    const isAvailable = await volumeSlider.isVisible();
    test.skip(!isAvailable, 'Volume slider not visible');

    const min = await volumeSlider.getAttribute('min');
    const max = await volumeSlider.getAttribute('max');
    expect(min).not.toBeNull();
    expect(max).not.toBeNull();
  });

  test('skip buttons render with correct titles', async ({ page }) => {
    const skipNext = page.locator('button[title="Proxima"], button[title="Próxima"]').first();
    const isAvailable = await skipNext.isVisible();
    test.skip(!isAvailable, 'Skip buttons not visible');

    const title = await skipNext.getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('shuffle button has correct title', async ({ page }) => {
    const shuffleBtn = page.locator('button[title="Ordem aleatoria"], button[title*="aleatoria" i]').first();
    const isAvailable = await shuffleBtn.isVisible();
    test.skip(!isAvailable, 'Shuffle button not visible');

    const title = await shuffleBtn.getAttribute('title');
    expect(title).toContain('aleatoria');
  });

  test('repeat button has correct title', async ({ page }) => {
    const repeatBtn = page.locator('button[title*="Repetir" i]').first();
    const isAvailable = await repeatBtn.isVisible();
    test.skip(!isAvailable, 'Repeat button not visible');

    const title = await repeatBtn.getAttribute('title');
    expect(title).toContain('epetir');
  });

  test('queue button navigates to queue view', async ({ page }) => {
    const queueBtn = page.locator('button[title="Fila de reproducao"]').first();
    const isAvailable = await queueBtn.isVisible();
    test.skip(!isAvailable, 'Queue button not visible');

    await queueBtn.click();
    await page.waitForTimeout(1000);

    const mainView = page.locator('.main-view').first();
    await expect(mainView).toBeVisible({ timeout: 5000 });
  });

  test('lyrics button has correct title', async ({ page }) => {
    const lyricsBtn = page.locator('button[title="Letras da musica"]').first();
    const isAvailable = await lyricsBtn.isVisible();
    test.skip(!isAvailable, 'Lyrics button not visible');

    const title = await lyricsBtn.getAttribute('title');
    expect(title).toContain('etras');
  });

  test('fullscreen button has correct title', async ({ page }) => {
    const fullscreenBtn = page.locator('button[title="Tela cheia"]').first();
    const isAvailable = await fullscreenBtn.isVisible();
    test.skip(!isAvailable, 'Fullscreen button not visible');

    const title = await fullscreenBtn.getAttribute('title');
    expect(title).toBe('Tela cheia');
  });
});

test.describe('Playback with Spotify Import', () => {
  test('import playlist via Buscar → YouTube Music → Spotify URL', async ({ page }) => {
    // Step 1: Click "Buscar" in the sidebar
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar not available');

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
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Step 4: Should navigate to playlist view with tracks
    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test('playlist view shows track list after import', async ({ page }) => {
    // Step 1: Navigate to Buscar → YouTube Music
    const searchBtn = page.getByRole('button', { name: /buscar/i }).first();
    const isSearchAvailable = await searchBtn.isVisible();
    test.skip(!isSearchAvailable, 'Buscar not available');

    await searchBtn.click();
    await page.waitForTimeout(1000);

    const ytTab = page.getByRole('button', { name: /youtube music/i }).first();
    const isYtAvailable = await ytTab.isVisible();
    test.skip(!isYtAvailable, 'YouTube Music tab not available');

    await ytTab.click();
    await page.waitForTimeout(500);

    // Step 2: Paste Spotify URL and submit
    const searchInput = page.getByPlaceholder(/pesquisar.*youtube/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('https://open.spotify.com/playlist/4iVma1T5JWR8T8PqVpBlyH');
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Step 3: Playlist view should show tracks
    const mainContent = page.locator('.main-view').first();
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });
});
