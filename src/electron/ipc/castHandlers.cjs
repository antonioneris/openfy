const { ipcMain } = require('electron');
const state = require('../utils/state.cjs');
const {
  startCastDiscovery,
  castToDevice,
  stopCasting,
  getLocalIpAddress
} = require('../services/castServer.cjs');
const { assertTrustedSender, requireString } = require('../utils/ipcSecurity.cjs');

function registerCastHandlers() {
  // IPC: Get list of discovered Chromecast devices
  ipcMain.handle('cast-get-devices', async (event) => {
    assertTrustedSender(event);
    if (state.discoveredCastDevices.length === 0) {
      startCastDiscovery();
      // Wait up to 4 seconds for devices to be discovered
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    return state.discoveredCastDevices;
  });

  // IPC: Re-scan network for Chromecast devices
  ipcMain.handle('cast-scan', async (event) => {
    assertTrustedSender(event);
    startCastDiscovery();
    await new Promise(resolve => setTimeout(resolve, 5000));
    return state.discoveredCastDevices;
  });

  // IPC: Cast audio to a specific Chromecast device
  ipcMain.handle('cast-to-device', async (event, { host, port }) => {
    try {
      assertTrustedSender(event);
      requireString(host, 'Host', 255);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('Porta inválida.');
      return await castToDevice(host, port);
    } catch (err) {
      console.error('[Cast Handler] Failed to cast to device:', err);
      throw err;
    }
  });

  // IPC: Stop casting to device
  ipcMain.handle('cast-stop', async (event) => {
    assertTrustedSender(event);
    return stopCasting();
  });

  // IPC: Get local IP address
  ipcMain.handle('get-local-ip', async (event) => {
    assertTrustedSender(event);
    return getLocalIpAddress();
  });
}

module.exports = registerCastHandlers;
