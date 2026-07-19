import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.openfy.player',
  appName: 'OpenFy',
  webDir: 'dist',
  plugins: {
    Filesystem: {
      androidScheme: 'https'
    }
  }
};

export default config;
