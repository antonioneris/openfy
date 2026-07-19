const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const DEV_SERVER_URL = 'http://127.0.0.1:5173';
const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;

let viteProcess;
let electronProcess;
let isStopping = false;

function stopChild(child) {
  if (child && child.exitCode === null && !child.killed) {
    child.kill('SIGTERM');
  }
}

function cleanup() {
  if (isStopping) return;
  isStopping = true;
  stopChild(electronProcess);
  stopChild(viteProcess);
}

function isServerReady() {
  return new Promise((resolve) => {
    const request = http.get(DEV_SERVER_URL, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(1_000, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function waitForServer() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`O Vite não iniciou em ${DEV_SERVER_URL} dentro de 30 segundos.`);
}

async function main() {
  const viteEntry = path.resolve(path.dirname(require.resolve('vite')), '..', '..', 'bin', 'vite.js');
  const electronExecutable = require('electron');

  viteProcess = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1'], {
    stdio: 'inherit',
    env: process.env
  });

  viteProcess.once('exit', (code) => {
    if (!isStopping && !electronProcess) {
      console.error(`[Dev] O Vite encerrou antes do Electron (código ${code ?? 'desconhecido'}).`);
      process.exitCode = code || 1;
    }
  });

  await waitForServer();

  const openDevTools = process.argv.includes('--devtools');
  electronProcess = spawn(electronExecutable, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENFY_DEV_SERVER_URL: DEV_SERVER_URL,
      OPENFY_OPEN_DEVTOOLS: openDevTools ? '1' : '0'
    }
  });

  electronProcess.once('exit', (code, signal) => {
    cleanup();
    if (signal && signal !== 'SIGINT' && signal !== 'SIGTERM') {
      console.error(`[Dev] Electron encerrado pelo sinal ${signal}.`);
    }
    process.exitCode = code || 0;
  });
}

process.once('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.once('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

main().catch((error) => {
  console.error(`[Dev] ${error.message}`);
  cleanup();
  process.exitCode = 1;
});
