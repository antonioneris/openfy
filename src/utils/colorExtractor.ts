/**
 * Extract the average dominant color of an image by downscaling it to a 1x1 canvas.
 * Falls back to Spotify's standard charcoal grey.
 */
export function getDominantColor(imgUrl?: string): Promise<string> {
  if (!imgUrl) return Promise.resolve('rgb(83, 83, 83)');

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('rgb(83, 83, 83)');
          return;
        }
        ctx.drawImage(img, 0, 0, 1, 1);
        const imgData = ctx.getImageData(0, 0, 1, 1).data;
        const r = imgData[0];
        const g = imgData[1];
        const b = imgData[2];
        
        // Return rgb string
        resolve(`rgb(${r}, ${g}, ${b})`);
      } catch (err) {
        console.warn('Falha ao extrair cor dominante (CORS ou Canvas):', err);
        resolve('rgb(83, 83, 83)');
      }
    };
    img.onerror = () => {
      resolve('rgb(83, 83, 83)');
    };
    img.src = imgUrl;
  });
}
