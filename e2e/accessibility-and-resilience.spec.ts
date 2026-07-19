import { test, expect } from './fixtures/base';

test.describe('Accessibility and resilience', () => {
  test('shows a true empty state only after initialization finishes', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sua biblioteca está vazia' })).toBeVisible();
    await expect(page.getByText('Carregando sua biblioteca')).toHaveCount(0);
  });

  test('explains an empty or unsupported folder selection', async ({ page }) => {
    await page.evaluate(() => {
      window.electronAPI!.readDirectory = async () => [];
    });
    await page.getByRole('button', { name: 'Adicionar pasta de música' }).click();

    await expect(page.getByText('Nenhum áudio compatível encontrado')).toBeVisible();
    await expect(page.getByText(/MP3, M4A, FLAC, OGG, WAV ou AAC/)).toBeVisible();
  });

  test('offers an actionable recovery when a saved folder loses permission', async ({ page }) => {
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('keyval', 'readwrite');
          transaction.objectStore('keyval').put(['/restricted/music'], 'spotify_local_folders');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
      });
      sessionStorage.setItem('mock-folder-permission-denied', 'true');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Confirme o acesso à sua biblioteca' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Reautorizar pasta' })).toBeVisible();
    await expect(page.getByRole('main').getByText('/restricted/music')).toBeVisible();
  });

  test('exposes player controls and documented keyboard shortcuts', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Reprodutor de áudio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tocar' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();

    await page.locator('body').click({ position: { x: 500, y: 200 } });
    await page.keyboard.press('q');
    await expect(page.getByRole('heading', { name: 'Fila de reprodução' })).toBeVisible();

    await page.getByRole('button', { name: 'Configurações' }).first().click();
    await expect(page.getByRole('heading', { name: 'Atalhos do teclado' })).toBeVisible();
    await expect(page.getByText('Tocar ou pausar')).toBeVisible();
  });

  test('keeps the layout within a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(page.getByRole('button', { name: /início/i }).last()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  });
});
