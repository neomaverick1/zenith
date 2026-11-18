import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

// The version shown in Settings: the package version, with the build number from the automated build.
const version = `${pkg.version.split('.').slice(0, 2).join('.')}.${process.env.GITHUB_RUN_NUMBER ?? 0}`;

export default defineConfig({
  // Relative paths, so the same build works on GitHub Pages (/zenith/) and inside the phone apps.
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' },
});
