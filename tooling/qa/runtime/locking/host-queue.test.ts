import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { expect, it, vi } from 'vitest';

import { createTempRoot } from '../../test-support/test-helpers';
import {
  acquireHostQaSlot,
  HOST_QUEUE_TICKET_ENV,
  readHostQueueTickets,
  isHostQueueOwnerAlive,
  removeAbandonedHostTickets,
} from './host-queue.mjs';

const queueUrl = new URL('./host-queue.mjs', import.meta.url).href;

it.skipIf(process.platform !== 'linux')(
  'rejects a marker whose process identity changed during the environment read',
  async () => {
    const root = createQueueRoot();
    const name = 'abandoned.json';
    const boot = '00000000-0000-0000-0000-000000000001';
    const candidatePid = 123456789;
    fs.writeFileSync(
      path.join(root, name),
      JSON.stringify({
        version: 1,
        pid: process.pid,
        identity: `${boot}:0`,
        wrapperId: 'qa:checkpoint',
        runId: null,
        admitted: true,
        released: false,
      }),
      { mode: 0o600 }
    );
    const read = fs.readFileSync;
    const stat = fs.statSync;
    const list = fs.readdirSync;
    let markerRead = false;
    let signaled = false;
    const listSpy = vi.spyOn(fs, 'readdirSync').mockImplementation((file, options) => {
      if (file === '/proc') return [String(candidatePid)];
      return list(file, options);
    });
    const statSpy = vi.spyOn(fs, 'statSync').mockImplementation((file, options) => {
      if (file === `/proc/${candidatePid}`) {
        markerRead = false;
        return stat(root);
      }
      return stat(file, options);
    });
    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      if (file === '/proc/sys/kernel/random/boot_id') return boot;
      if (file === `/proc/${candidatePid}/stat`) {
        const fields = ['S', ...Array<string>(19).fill('0')];
        fields[19] = markerRead ? '200' : '100';
        return `${candidatePid} (fixture) ${fields.join(' ')}`;
      }
      if (file === `/proc/${candidatePid}/environ`) {
        markerRead = true;
        return signaled ? '' : `${HOST_QUEUE_TICKET_ENV}=${name}\0`;
      }
      return read(file, options);
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      signaled = true;
      return true;
    });
    try {
      await removeAbandonedHostTickets(root);
      expect(killSpy).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(root, name))).toBe(false);
    } finally {
      killSpy.mockRestore();
      readSpy.mockRestore();
      statSpy.mockRestore();
      listSpy.mockRestore();
    }
  }
);

function createQueueRoot() {
  const root = createTempRoot('qa-host-queue-');
  fs.chmodSync(root, 0o700);
  return root;
}

function startClient(root: string, label: string, orphan = false) {
  const folder = path.join(root, label);
  fs.mkdirSync(folder);
  const script = path.join(folder, 'client.mjs');
  fs.writeFileSync(
    script,
    `
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { acquireHostQaSlot, HOST_QUEUE_TICKET_ENV } from ${JSON.stringify(queueUrl)};
const root = ${JSON.stringify(root)};
const label = ${JSON.stringify(label)};
const slot = await acquireHostQaSlot('qa:checkpoint', { sharedRoot: root, pollIntervalMs: 25 });
process.env[HOST_QUEUE_TICKET_ENV] = slot.ticketName;
fs.appendFileSync(root + '/trace', label + ':start\\n');
const orphan = ${
      orphan
        ? [
            "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],",
            "{ env: { ...process.env }, detached: true, stdio: 'ignore' })",
          ].join(' ')
        : 'null'
    };
process.stdout.write('ready:' + (orphan?.pid ?? 0) + '\\n');
process.stdin.resume();
process.stdin.once('end', () => {
  fs.appendFileSync(root + '/trace', label + ':end\\n');
  if (orphan) orphan.kill('SIGTERM');
  slot.release();
  process.exit(0);
});
`
  );
  const environment = { ...process.env };
  delete environment[HOST_QUEUE_TICKET_ENV];
  const child = spawn(process.execPath, [script], {
    cwd: folder,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr?.on('data', (data) => {
    errors += data.toString();
  });
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  const ready = new Promise<number>((resolve, reject) => {
    let buffer = '';
    child.stdout?.on('data', (data) => {
      buffer += data.toString();
      const match = /^ready:(\d+)\n$/u.exec(buffer);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(errors || 'Queue client stopped.'));
    });
  });
  // A killed waiting client never emits readiness. Its rejection is inspected only when awaited.
  void ready.catch(() => {});
  return { child, ready, exited };
}

async function waitForTicketCount(root: string, count: number) {
  const started = Date.now();
  while (readHostQueueTickets(root).length !== count) {
    if (Date.now() - started > 5000) throw new Error('Queue fixture did not register.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function stopClients(...clients: Array<{ child: ChildProcess }>) {
  for (const { child } of clients) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

function stopOrphan(pid: number) {
  if (!pid) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ESRCH')
      throw error;
  }
}

it.skipIf(process.platform !== 'linux')(
  'serializes FIFO clients from three directories',
  async () => {
    const root = createQueueRoot();
    const first = startClient(root, 'first');
    let second: ReturnType<typeof startClient> | undefined;
    let third: ReturnType<typeof startClient> | undefined;
    try {
      await first.ready;
      second = startClient(root, 'second');
      await waitForTicketCount(root, 2);
      third = startClient(root, 'third');
      await waitForTicketCount(root, 3);
      expect(fs.readFileSync(path.join(root, 'trace'), 'utf8')).toBe('first:start\n');
      first.child.stdin?.end();
      await first.exited;
      await second.ready;
      expect(fs.readFileSync(path.join(root, 'trace'), 'utf8')).toBe(
        'first:start\nfirst:end\nsecond:start\n'
      );
      second.child.stdin?.end();
      await second.exited;
      await third.ready;
      third.child.stdin?.end();
      await third.exited;
      expect(fs.readFileSync(path.join(root, 'trace'), 'utf8').trim().split('\n')).toEqual([
        'first:start',
        'first:end',
        'second:start',
        'second:end',
        'third:start',
        'third:end',
      ]);
    } finally {
      stopClients(first, ...(second ? [second] : []), ...(third ? [third] : []));
    }
  }
);

it.skipIf(process.platform !== 'linux')(
  'cancels a waiter and removes its ticket without disturbing the owner',
  async () => {
    const root = createQueueRoot();
    const first = await acquireHostQaSlot('qa:checkpoint', { sharedRoot: root });
    const controller = new AbortController();
    const waiting = acquireHostQaSlot('qa:closeout', {
      sharedRoot: root,
      signal: controller.signal,
      pollIntervalMs: 25,
    });
    try {
      await waitForTicketCount(root, 2);
      controller.abort(new Error('fixture cancelled'));
      await expect(waiting).rejects.toThrow('fixture cancelled');
      expect(readHostQueueTickets(root)).toHaveLength(1);
    } finally {
      first.release();
    }
    const next = await acquireHostQaSlot('qa:checkpoint', { sharedRoot: root });
    next.release();
  }
);

it.skipIf(process.platform !== 'linux')(
  'removes a dead waiter and stops an abandoned owner child before admitting the next client',
  async () => {
    const root = createQueueRoot();
    const first = startClient(root, 'first', true);
    let second: ReturnType<typeof startClient> | undefined;
    let orphanPid = 0;
    try {
      orphanPid = await first.ready;
      second = startClient(root, 'second');
      await waitForTicketCount(root, 2);
      second.child.kill('SIGKILL');
      await second.exited;
      first.child.kill('SIGKILL');
      await first.exited;
      const next = await acquireHostQaSlot('qa:closeout', { sharedRoot: root });
      next.release();
      const raw = fs.existsSync(`/proc/${orphanPid}/stat`)
        ? fs.readFileSync(`/proc/${orphanPid}/stat`, 'utf8')
        : '';
      expect(raw === '' || raw.slice(raw.lastIndexOf(')') + 2).startsWith('Z ')).toBe(true);
      expect(readHostQueueTickets(root)).toHaveLength(0);
    } finally {
      stopClients(first, ...(second ? [second] : []));
      stopOrphan(orphanPid);
    }
  }
);

it.skipIf(process.platform !== 'linux')(
  'rejects unsafe directories and malformed records without admitting QA',
  async () => {
    const root = createQueueRoot();
    fs.chmodSync(root, 0o755);
    await expect(acquireHostQaSlot('qa:checkpoint', { sharedRoot: root })).rejects.toThrow(
      'private directory'
    );
    fs.chmodSync(root, 0o700);
    fs.writeFileSync(path.join(root, 'invalid.json'), '{invalid', { mode: 0o600 });
    await expect(acquireHostQaSlot('qa:checkpoint', { sharedRoot: root })).rejects.toThrow();
    expect(fs.existsSync(path.join(root, 'invalid.json'))).toBe(true);
  }
);

it.skipIf(process.platform !== 'linux')(
  'does not follow a symlink for the admission lock',
  async () => {
    const root = createQueueRoot();
    const target = path.join(root, 'target');
    fs.writeFileSync(target, 'preserve', { mode: 0o600 });
    fs.symlinkSync(target, path.join(root, 'admission.lock'));
    await expect(acquireHostQaSlot('qa:checkpoint', { sharedRoot: root })).rejects.toThrow(
      'invalid ownership'
    );
    expect(fs.readFileSync(target, 'utf8')).toBe('preserve');
  }
);

it.skipIf(process.platform !== 'linux')(
  'reports waiting once and rejects PID reuse or a different boot identity',
  async () => {
    const root = createQueueRoot();
    const first = await acquireHostQaSlot('qa:checkpoint', { sharedRoot: root });
    const owner = readHostQueueTickets(root)[0].record;
    expect(isHostQueueOwnerAlive(owner)).toBe(true);
    expect(isHostQueueOwnerAlive({ ...owner, identity: `${owner.identity}0` })).toBe(false);
    expect(
      isHostQueueOwnerAlive({
        ...owner,
        identity: `00000000-0000-0000-0000-000000000000:${owner.identity.split(':')[1]}`,
      })
    ).toBe(false);
    const waitingMessage = vi.fn();
    const controller = new AbortController();
    const waiting = acquireHostQaSlot('qa:closeout', {
      sharedRoot: root,
      signal: controller.signal,
      onWaiting: waitingMessage,
    });
    try {
      await vi.waitFor(() => expect(waitingMessage).toHaveBeenCalledOnce(), { timeout: 2500 });
      expect(waitingMessage).toHaveBeenCalledWith({ owner: 'qa:checkpoint', position: 1 });
      first.release();
      const next = await waiting;
      next.release();
      expect(waitingMessage).toHaveBeenCalledOnce();
    } finally {
      controller.abort();
      first.release();
    }
  }
);
