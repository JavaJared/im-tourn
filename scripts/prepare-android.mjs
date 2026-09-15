import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function cap(...args) {
  const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync('dist/index.html')) throw new Error('Build the web app first: npm run build');
if (!existsSync('android')) cap('add', 'android');
cap('sync', 'android');
