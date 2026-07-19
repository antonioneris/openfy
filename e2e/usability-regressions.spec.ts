import { test, expect } from './fixtures/base';

test.describe('Usability regressions', () => {
  test('normalizes whitespace in an empty local search', async ({ page }) => {
    await page.getByRole('button', { name: /buscar/i }).first().click();
    const input = page.getByPlaceholder('O que você quer ouvir na sua biblioteca?');
    await input.fill(' test ');

    await expect(page.getByText('Nenhum resultado encontrado para “test”.')).toBeVisible();
  });

  test('shows a descriptive status while an online search is pending', async ({ page }) => {
    await page.getByRole('button', { name: /buscar/i }).first().click();
    await page.getByRole('button', { name: /buscar na internet/i }).click();
    await page.evaluate(() => {
      const api = window.electronAPI!;
      api.searchYouTubeMusic = async () => {
        await new Promise(resolve => setTimeout(resolve, 700));
        return { songs: [], artists: [], albums: [], playlists: [] };
      };
    });

    const input = page.getByPlaceholder(/pesquisar músicas/i);
    await input.fill('Daft Punk');
    await input.press('Enter');

    await expect(page.getByText('Buscando “Daft Punk” no YouTube Music…')).toBeVisible();
    await expect(page.getByText('Nenhum resultado encontrado no YouTube Music.')).toBeVisible();
  });

  test('does not let an older response replace a newer search', async ({ page }) => {
    await page.getByRole('button', { name: /buscar/i }).first().click();
    await page.getByRole('button', { name: /buscar na internet/i }).click();
    await page.evaluate(() => {
      window.electronAPI!.searchYouTubeMusic = async (query: string) => {
        await new Promise(resolve => setTimeout(resolve, query === 'primeira' ? 800 : 100));
        return {
          songs: [{ videoId: query, name: `Resultado ${query}`, artist: { name: 'Teste' }, duration: 10, thumbnails: [] }],
          artists: [], albums: [], playlists: []
        };
      };
    });

    const input = page.getByPlaceholder(/pesquisar músicas/i);
    await input.fill('primeira');
    await input.press('Enter');
    await input.fill('segunda');
    await input.press('Enter');

    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Músicas', exact: true }).click();
    await expect(page.getByText('Resultado segunda')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.getByText('Resultado primeira')).toHaveCount(0);
  });

  test('explains offline search and retries after reconnecting', async ({ page }) => {
    await page.getByRole('button', { name: /buscar/i }).first().click();
    await page.getByRole('button', { name: /buscar na internet/i }).click();
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    });

    const input = page.getByPlaceholder(/pesquisar músicas/i);
    await input.fill('offline test');
    await input.press('Enter');
    await expect(page.getByText('Você está sem conexão. Reconecte-se e tente novamente.')).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.electronAPI!.searchYouTubeMusic = async () => ({
        songs: [{ videoId: 'back-online', name: 'Conexão restaurada', artist: { name: 'Teste' }, duration: 10, thumbnails: [] }],
        artists: [], albums: [], playlists: []
      });
    });
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.getByRole('button', { name: 'Músicas', exact: true }).click();
    await expect(page.getByText('Conexão restaurada')).toBeVisible();
  });
});
