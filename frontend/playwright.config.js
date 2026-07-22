import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Python del backend: usa el venv si existe (backend/.venv), si no el del sistema.
// Configurable con la variable de entorno E2E_PYTHON.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const venvPython =
  process.platform === 'win32'
    ? path.join(__dirname, '..', 'backend', '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '..', 'backend', '.venv', 'bin', 'python');
const PYTHON =
  process.env.E2E_PYTHON ||
  (fs.existsSync(venvPython) ? `"${venvPython}"` : process.platform === 'win32' ? 'python' : 'python3');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Backend con DB e2e aislada + datos sembrados (usuario e2e / e2e12345)
      command: `${PYTHON} -m scripts.run_e2e_server`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8001/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Frontend apuntando al backend e2e
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      env: { VITE_API_URL: 'http://localhost:8001' },
      timeout: 60_000,
    },
  ],
});
