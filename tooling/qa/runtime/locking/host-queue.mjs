import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const HOST_QUEUE_TICKET_ENV = 'SNIPTALE_QA_HOST_QUEUE_TICKET';
const WORKER_PATH = fileURLToPath(new URL('./host-queue-worker.mjs', import.meta.url));
const RECORD_KEYS = ['admitted', 'identity', 'pid', 'released', 'runId', 'version', 'wrapperId'];

function readProcess(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    if (!/^\d+$/u.test(fields[19] ?? '')) throw new Error('Invalid QA process identity.');
    return { state: fields[0], start: fields[19] };
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return null;
    throw error;
  }
}

function processIdentity(pid) {
  const info = readProcess(pid);
  if (!info || info.state === 'Z') return null;
  return `${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${info.start}`;
}

/** Validate the private directory before a process reads or changes queue records. */
export function assertHostQueueDirectory(root) {
  if (!path.isAbsolute(root)) throw new Error('QA host queue requires an absolute directory.');
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) {
    throw new Error('QA host queue requires a private directory owned by the current user.');
  }
}

function writeTicket(file, record) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Parse the queue protocol before its process identities can affect admission or cleanup. */
export function readHostQueueTickets(root) {
  assertHostQueueDirectory(root);
  return fs
    .readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const file = path.join(root, name);
      let record;
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) {
          throw new Error('QA queue record has invalid ownership or permissions.');
        }
        if (stat.size > 4096) throw new Error('QA queue record exceeds its size limit.');
        record = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      if (
        !record ||
        typeof record !== 'object' ||
        Array.isArray(record) ||
        Object.keys(record).sort().join() !== RECORD_KEYS.join() ||
        record.version !== 1 ||
        !Number.isSafeInteger(record.pid) ||
        record.pid < 1 ||
        typeof record.identity !== 'string' ||
        !/^[a-f0-9-]{36}:\d+$/u.test(record.identity) ||
        typeof record.wrapperId !== 'string' ||
        !/^[a-z][a-z0-9:.-]{0,63}$/u.test(record.wrapperId) ||
        (record.runId !== null &&
          (typeof record.runId !== 'string' || record.runId.length > 256)) ||
        typeof record.admitted !== 'boolean' ||
        typeof record.released !== 'boolean'
      ) {
        throw new Error('QA queue record has an invalid protocol.');
      }
      return [{ name, file, record }];
    });
}

/** Distinguish a live owner from a reused PID or a previous Linux boot. */
export function isHostQueueOwnerAlive(record) {
  return processIdentity(record.pid) === record.identity;
}

function ticketProcesses(name, ownerPid) {
  const result = [];
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/u.test(entry) || Number(entry) === ownerPid) continue;
    const pid = Number(entry);
    try {
      if (fs.statSync(`/proc/${pid}`).uid !== process.getuid()) continue;
      const info = readProcess(pid);
      if (!info || info.state === 'Z') continue;
      const identity = `${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${info.start}`;
      const environment = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
      if (
        environment.split('\0').includes(`${HOST_QUEUE_TICKET_ENV}=${name}`) &&
        processIdentity(pid) === identity
      ) {
        result.push({ pid, identity });
      }
    } catch (error) {
      // Protected services can share this UID. Only a readable marker proves membership.
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    }
  }
  return result;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTicketProcesses(ticket, timeout) {
  const started = Date.now();
  while (ticketProcesses(ticket.name, ticket.record.pid).length > 0) {
    if (Date.now() - started >= timeout) return false;
    await wait(50);
  }
  return true;
}

function signalTicketProcesses(ticket, signal) {
  for (const child of ticketProcesses(ticket.name, ticket.record.pid)) {
    if (!child.identity || processIdentity(child.pid) !== child.identity) continue;
    try {
      process.kill(child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

/** Hold admission until abandoned QA descendants exit. Never signal another ticket's processes. */
export async function removeAbandonedHostTickets(root) {
  for (const ticket of readHostQueueTickets(root)) {
    if (!ticket.record.released && isHostQueueOwnerAlive(ticket.record)) continue;
    if (!(await waitForTicketProcesses(ticket, 1000))) {
      signalTicketProcesses(ticket, 'SIGTERM');
      if (!(await waitForTicketProcesses(ticket, 1000))) {
        signalTicketProcesses(ticket, 'SIGKILL');
        if (!(await waitForTicketProcesses(ticket, 5000))) {
          throw new Error('Abandoned QA processes did not stop. Host admission remains closed.');
        }
      }
    }
    fs.rmSync(ticket.file, { force: true });
  }
}

/** Record admission while the kernel lock serializes all queue decisions. */
export function admitHostQueueTicket(ticket) {
  writeTicket(ticket.file, { ...ticket.record, admitted: true });
}

function leaseAttempt(root, name, signal, onWaiting) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env };
    delete environment[HOST_QUEUE_TICKET_ENV];
    const child = spawn(
      'flock',
      ['--exclusive', path.join(root, 'admission.lock'), process.execPath, WORKER_PATH, root, name],
      { env: environment, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let output = '';
    let errors = '';
    let settled = false;
    const waitingTimer = setTimeout(reportWaiting, 1000);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(waitingTimer);
      signal?.removeEventListener('abort', abort);
      callback(value);
    };
    function abort() {
      child.stdin.end();
      child.kill('SIGTERM');
      finish(reject, signal?.reason ?? new Error('QA host admission was cancelled.'));
    }
    function reportWaiting() {
      try {
        onWaiting();
      } catch (error) {
        child.stdin.end();
        child.kill('SIGTERM');
        finish(reject, error);
      }
    }
    child.stdin.on('error', () => {});
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (output === 'acquired\n') finish(resolve, child);
      else if (output.length > 64) abort();
    });
    child.stderr.on('data', (data) => {
      errors = (errors + data.toString()).slice(-4096);
    });
    child.once('error', (error) => finish(reject, error));
    child.once('exit', (code) => {
      if (code === 0 && output === 'waiting\n') {
        reportWaiting();
        finish(resolve, null);
      } else if (!settled) {
        finish(reject, new Error(errors || 'QA host admission helper failed.'));
      }
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Reserve one FIFO slot for blocking QA under the current Linux user. */
export async function acquireHostQaSlot(
  wrapperId,
  {
    runId = null,
    sharedRoot = `/tmp/sniptale-qa-${process.getuid?.() ?? 'local'}`,
    signal,
    onWaiting = () => {},
    pollIntervalMs = 1000,
  } = {}
) {
  if (process.platform !== 'linux') return { ticketName: null, release() {} };
  fs.mkdirSync(sharedRoot, { recursive: true, mode: 0o700 });
  assertHostQueueDirectory(sharedRoot);
  const lock = path.join(sharedRoot, 'admission.lock');
  try {
    const descriptor = fs.openSync(lock, 'wx', 0o600);
    fs.closeSync(descriptor);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const lockStat = fs.lstatSync(lock);
  if (
    !lockStat.isFile() ||
    lockStat.uid !== process.getuid() ||
    (lockStat.mode & 0o777) !== 0o600
  ) {
    throw new Error('QA admission lock has invalid ownership or permissions.');
  }
  const name = `${process.hrtime.bigint().toString().padStart(24, '0')}-${process.pid}-${randomUUID()}.json`;
  const file = path.join(sharedRoot, name);
  const record = {
    version: 1,
    pid: process.pid,
    identity: processIdentity(process.pid),
    wrapperId,
    runId,
    admitted: false,
    released: false,
  };
  writeTicket(file, record);
  let waitingReported = false;
  const reportWaiting = () => {
    if (waitingReported) return;
    waitingReported = true;
    const tickets = readHostQueueTickets(sharedRoot);
    const owner = tickets.find((ticket) => ticket.record.admitted && !ticket.record.released);
    const position =
      tickets
        .filter((ticket) => !ticket.record.admitted)
        .findIndex((ticket) => ticket.name === name) + 1;
    onWaiting({ owner: owner?.record.wrapperId ?? null, position });
  };
  let child;
  let released = false;
  function release() {
    if (released) return;
    released = true;
    try {
      if (fs.existsSync(file)) {
        if (ticketProcesses(name, record.pid).length === 0) fs.rmSync(file, { force: true });
        else writeTicket(file, { ...record, admitted: Boolean(child), released: true });
      }
    } finally {
      child?.stdin.end();
    }
  }
  try {
    while (!child) {
      if (signal?.aborted) throw signal?.reason ?? new Error('QA host admission was cancelled.');
      child = await leaseAttempt(sharedRoot, name, signal, reportWaiting);
      if (!child) await wait(pollIntervalMs);
    }
    return { ticketName: name, release };
  } catch (error) {
    release();
    throw error;
  }
}
