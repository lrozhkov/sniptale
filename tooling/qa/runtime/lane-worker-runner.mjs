import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseQaWorkerEnvelope } from './lane-worker-contract.mjs';

const GRACEFUL_TERMINATION_MS = 1000;
const FORCED_TERMINATION_MS = 2000;
const PROCESS_GROUP_POLL_MS = 25;

function cancellationError(signal, label) {
  return signal?.reason instanceof Error ? signal.reason : new Error(`${label} was cancelled.`);
}

function hasExited(child) {
  return child.exitCode != null || child.signalCode != null;
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeoutMs);
    function onExit() {
      clearTimeout(timeout);
      resolve(true);
    }
    child.once('exit', onExit);
  });
}

function hasPosixProcessGroup(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

function waitForPosixProcessGroupExit(pid, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function poll() {
      try {
        if (!hasPosixProcessGroup(pid)) {
          resolve(true);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, PROCESS_GROUP_POLL_MS);
    }
    poll();
  });
}

function runWindowsTreeKill(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    killer.once('error', () => resolve());
    killer.once('exit', () => resolve());
  });
}

function signalProcessTree(child, signal) {
  if (!child.pid || (process.platform === 'win32' && hasExited(child))) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await runWindowsTreeKill(child.pid);
    await waitForExit(child, FORCED_TERMINATION_MS);
    return;
  }
  if (!hasPosixProcessGroup(child.pid)) return;
  signalProcessTree(child, 'SIGTERM');
  if (await waitForPosixProcessGroupExit(child.pid, GRACEFUL_TERMINATION_MS)) return;
  signalProcessTree(child, 'SIGKILL');
  if (!(await waitForPosixProcessGroupExit(child.pid, FORCED_TERMINATION_MS))) {
    throw new Error(`QA lane process group ${child.pid} did not terminate.`);
  }
}

function createExecArgv(memoryMiB) {
  return [
    ...process.execArgv.filter(
      (argument) =>
        !argument.startsWith('--input-type') && !argument.startsWith('--max-old-space-size')
    ),
    `--max-old-space-size=${Math.max(256, memoryMiB - 128)}`,
  ];
}

export function runQaLaneWorker({
  label,
  memoryMiB,
  resultParser,
  signal,
  workerArguments = [],
  workerData,
  workerUrl,
}) {
  if (typeof resultParser !== 'function') {
    throw new Error(`${label} requires a result parser.`);
  }
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(workerUrl), workerArguments, {
      detached: process.platform !== 'win32',
      env: { ...process.env, SNIPTALE_QA_LANE_PROCESS: '1' },
      execArgv: createExecArgv(memoryMiB),
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    let settlementStarted = false;

    const removeAbortListener = () => signal?.removeEventListener('abort', onAbort);
    const finish = (callback) => {
      if (settlementStarted) return;
      settlementStarted = true;
      removeAbortListener();
      void terminateProcessTree(child).then(callback, reject);
    };
    const finishRejected = (error) => finish(() => reject(error));
    function onAbort() {
      finishRejected(cancellationError(signal, label));
    }

    child.once('message', (message) => {
      try {
        const envelope = parseQaWorkerEnvelope(message, `${label} failed.`);
        if (!envelope.ok) {
          finishRejected(envelope.error);
          return;
        }
        const value = resultParser(envelope.value);
        finish(() => resolve(value));
      } catch (error) {
        finishRejected(error);
      }
    });
    child.once('error', finishRejected);
    child.once('exit', (exitCode, exitSignal) => {
      if (settlementStarted) return;
      finishRejected(
        new Error(
          `${label} exited without a result (code ${exitCode ?? 'null'}, signal ${exitSignal ?? 'none'}).`
        )
      );
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else {
      child.send(workerData, (error) => {
        if (error) finishRejected(error);
      });
    }
  });
}
