import fs from 'node:fs';
import { spawn } from 'node:child_process';

const mode = process.argv[2];
const RESISTANT_CHILD_SOURCE = [
  "process.on('SIGTERM', () => {});",
  "process.send?.('ready');",
  'setInterval(() => {}, 1000);',
].join('');

if (mode === 'spawn-child' || mode === 'spawn-child-then-exit') {
  process.once('message', ({ pidFile }) => {
    const child = spawn(process.execPath, ['-e', RESISTANT_CHILD_SOURCE], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    child.once('message', () => {
      fs.writeFileSync(pidFile, String(child.pid));
      if (mode === 'spawn-child-then-exit') process.exit(7);
    });
    setInterval(() => {}, 1000);
  });
}
