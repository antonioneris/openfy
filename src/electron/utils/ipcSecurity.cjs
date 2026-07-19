const fs = require('fs');
const path = require('path');

const authorizedRoots = new Set();
const persistentRoots = new Set();
let registryPath = '';

function normalizePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new TypeError('Caminho inválido.');
  }
  return path.resolve(path.normalize(value));
}

function resolveSymlinks(value) {
  const normalized = normalizePath(value);
  let existing = normalized;
  const suffix = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const canonicalBase = fs.existsSync(existing) ? fs.realpathSync(existing) : existing;
  return path.join(canonicalBase, ...suffix);
}

function initializePathRegistry(userDataPath, tempPath) {
  registryPath = path.join(userDataPath, 'authorized-folders.json');
  authorizedRoots.add(resolveSymlinks(tempPath));
  try {
    const saved = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (Array.isArray(saved)) saved.forEach(value => {
      const root = resolveSymlinks(value);
      authorizedRoots.add(root);
      persistentRoots.add(root);
    });
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[IPC Security] Could not load authorized folders:', error.message);
  }
}

function authorizeRoot(value) {
  const root = resolveSymlinks(value);
  authorizedRoots.add(root);
  persistentRoots.add(root);
  if (registryPath) {
    fs.writeFileSync(registryPath, JSON.stringify([...persistentRoots], null, 2), { mode: 0o600 });
  }
  return root;
}

function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertPathAllowed(value, extensions) {
  const candidate = resolveSymlinks(value);
  if (![...authorizedRoots].some(root => isPathInside(candidate, root))) {
    throw new Error('Acesso negado: o caminho não pertence a uma pasta autorizada.');
  }
  if (extensions && !extensions.includes(path.extname(candidate).toLowerCase())) {
    throw new Error('Acesso negado: tipo de arquivo não permitido.');
  }
  return candidate;
}

function assertTrustedSender(event) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  if (
    !senderUrl.startsWith('file://') &&
    !senderUrl.startsWith('http://localhost:5173') &&
    !senderUrl.startsWith('http://127.0.0.1:5173')
  ) {
    throw new Error('Origem IPC não autorizada.');
  }
}

function requireString(value, name, maxLength = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} inválido.`);
  }
  return value;
}

function requireHttpUrl(value, name = 'URL') {
  const parsed = new URL(requireString(value, name, 8192));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError(`${name} deve usar HTTP ou HTTPS.`);
  return parsed.href;
}

module.exports = {
  initializePathRegistry,
  authorizeRoot,
  assertPathAllowed,
  assertTrustedSender,
  requireString,
  requireHttpUrl
};
