import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.triagelens.app',
  appName: 'TriageLens',
  webDir: 'dist',
  // Serve bundled files on the device. Do not point server.url at the Vercel site.
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};

export default config;
