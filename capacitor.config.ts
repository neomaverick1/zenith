import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neomaverick.zenith',
  appName: 'Zenith',
  webDir: 'dist',
  backgroundColor: '#07081c',
  android: { backgroundColor: '#07081c' },
  plugins: {
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
  },
};

export default config;
