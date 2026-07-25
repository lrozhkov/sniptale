import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runQaLaneWorker } from './lane-worker-runner.mjs';

it('rejects a clean worker exit that never publishes a result', async () => {
  await expect(
    runQaLaneWorker({
      label: 'empty QA worker',
      memoryMiB: 256,
      resultParser: (value) => value,
      workerData: null,
      workerArguments: ['exit'],
      workerUrl: new URL('./lane-worker-process.fixture.mjs', import.meta.url),
    })
  ).rejects.toThrow('empty QA worker exited without a result (code 0, signal none)');
});

it('escalates and awaits a SIGTERM-resistant lane process group before rejecting an abort', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-process-'));
  const pidFile = path.join(root, 'child.pid');
  const cancellation = new AbortController();
  const result = runQaLaneWorker({
    label: 'cancelled QA worker',
    memoryMiB: 256,
    resultParser: (value) => value,
    signal: cancellation.signal,
    workerArguments: ['spawn-child'],
    workerData: { pidFile },
    workerUrl: new URL('./lane-worker-process.fixture.mjs', import.meta.url),
  });

  await vi.waitFor(() => expect(fs.existsSync(pidFile)).toBe(true));
  const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
  cancellation.abort(new Error('stop lane'));
  await expect(result).rejects.toThrow('stop lane');
  await vi.waitFor(() => expect(() => process.kill(childPid, 0)).toThrow());
  fs.rmSync(root, { recursive: true, force: true });
}, 10_000);

it('cleans up resistant descendants after a lane parent exits without a result', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-process-exit-'));
  const pidFile = path.join(root, 'child.pid');
  const result = runQaLaneWorker({
    label: 'exited QA worker',
    memoryMiB: 256,
    resultParser: (value) => value,
    workerArguments: ['spawn-child-then-exit'],
    workerData: { pidFile },
    workerUrl: new URL('./lane-worker-process.fixture.mjs', import.meta.url),
  });

  await vi.waitFor(() => expect(fs.existsSync(pidFile)).toBe(true));
  const childPid = Number(fs.readFileSync(pidFile, 'utf8'));
  await expect(result).rejects.toThrow('exited QA worker exited without a result (code 7');
  await vi.waitFor(() => expect(() => process.kill(childPid, 0)).toThrow());
  fs.rmSync(root, { recursive: true, force: true });
}, 10_000);
