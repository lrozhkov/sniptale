import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const helperPath = path.resolve('.tmp/security-e2e-x11-keypress');
const sourcePath = path.resolve('tooling/test/e2e/support/x11-keypress.c');

function ensureHelper(): void {
  mkdirSync(path.dirname(helperPath), { recursive: true });
  const compile = spawnSync('gcc', [sourcePath, '-o', helperPath, '-ldl'], {
    encoding: 'utf8',
  });
  if (compile.status !== 0) {
    throw new Error(`Failed to compile X11 permission helper: ${compile.stderr.trim()}`);
  }
}

/** Accepts Chromium's browser-owned optional extension permission confirmation under Xvfb. */
export function acceptOptionalExtensionPermissionPrompt(): void {
  if (process.platform !== 'linux' || !process.env.DISPLAY) {
    throw new Error('Security permission E2E requires Linux with an active X display');
  }
  ensureHelper();
  const result = spawnSync(helperPath, ['Tab', 'Return'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to accept Chromium permission prompt: ${result.stderr.trim()}`);
  }
}
