const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { scanAudioFiles } = require('../src/electron/services/directoryScanner.cjs');

const sizes = process.argv.slice(2).map(Number).filter(Number.isFinite);
const sampleSizes = sizes.length > 0 ? sizes : [100, 1000, 10000];

async function benchmark(size) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `openfy-benchmark-${size}-`));
  try {
    for (let index = 0; index < size; index++) {
      fs.writeFileSync(path.join(root, `track-${String(index).padStart(5, '0')}.mp3`), '');
    }
    const startedAt = performance.now();
    const files = await scanAudioFiles(root);
    return {
      files: files.length,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(async () => {
  const results = [];
  for (const size of sampleSizes) results.push(await benchmark(size));
  process.stdout.write(`${JSON.stringify({ benchmark: 'directory-discovery', results }, null, 2)}\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
