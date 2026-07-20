import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { fromRelativePath } from '../core/shared.mjs';

const LOCK_PATH = '.tmp/qa/locks/blocking-wrapper.lock.json';
const BLOCKING_WRAPPER_NAMES =
  'qa:checkpoint, qa:closeout, qa:build, qa:release, qa:release-harness, or qa:audit';

function readLockFile(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomicLockFile(lockPath, value, { exclusive = false } = {}) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const temporaryPath = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (exclusive) {
      fs.linkSync(temporaryPath, lockPath);
      fs.rmSync(temporaryPath, { force: true });
    } else {
      fs.renameSync(temporaryPath, lockPath);
    }
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createLockError(lockData) {
  const owner = lockData?.wrapperId ?? 'another blocking QA wrapper';
  const pid = lockData?.pid ? ` (pid ${lockData.pid})` : '';
  return new Error(
    [
      `Another blocking QA wrapper is already running: ${owner}${pid}.`,
      `Wait for it to finish before starting ${BLOCKING_WRAPPER_NAMES}.`,
    ].join(' ')
  );
}

function digestHandoffToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function matchesHandoffToken(token, expectedDigest) {
  if (typeof token !== 'string' || typeof expectedDigest !== 'string') return false;
  const supplied = Buffer.from(digestHandoffToken(token), 'hex');
  const expected = Buffer.from(expectedDigest, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function authorizeBlockingWrapperLockHandoff(wrapperId, handoff) {
  const absolutePath = fromRelativePath(LOCK_PATH);
  const existing = readLockFile(absolutePath);
  if (existing?.pid !== process.pid || existing?.wrapperId !== wrapperId) {
    throw new Error(
      `Cannot authorize ${handoff?.consumerId ?? 'wrapper'} handoff without lock owner`
    );
  }

  if (typeof handoff?.token !== 'string' || handoff.token.length === 0) {
    throw new Error('Cannot authorize a blocking-wrapper handoff without a token');
  }
  if (
    handoff.parentRunId !== existing.runId ||
    handoff.rootRunId !== existing.rootRunId ||
    typeof handoff.runId !== 'string' ||
    handoff.runId.length === 0
  ) {
    throw new Error('Cannot authorize a blocking-wrapper handoff with mismatched run lineage');
  }
  const { token, ...persistedHandoff } = handoff;
  const nextLockData = {
    ...existing,
    handoff: {
      ...persistedHandoff,
      tokenDigest: digestHandoffToken(token),
    },
  };
  writeAtomicLockFile(absolutePath, nextLockData);
}

function assertBlockingWrapperLockHandoff({
  ownerId,
  consumerId,
  token,
  ownerPid = process.ppid,
  runId,
  rootRunId,
  parentRunId,
}) {
  const absolutePath = fromRelativePath(LOCK_PATH);
  const existing = readLockFile(absolutePath);
  if (
    existing?.wrapperId !== ownerId ||
    existing?.pid !== ownerPid ||
    existing?.handoff?.consumerId !== consumerId ||
    !matchesHandoffToken(token, existing?.handoff?.tokenDigest) ||
    existing?.handoff?.runId !== runId ||
    existing?.handoff?.rootRunId !== rootRunId ||
    existing?.handoff?.parentRunId !== parentRunId
  ) {
    throw new Error(`Invalid blocking-wrapper lock handoff for ${consumerId}`);
  }

  return existing;
}

export function claimBlockingWrapperLockHandoff({
  ownerId,
  consumerId,
  token,
  ownerPid = process.ppid,
  runId,
  rootRunId,
  parentRunId,
}) {
  const absolutePath = fromRelativePath(LOCK_PATH);
  const existing = assertBlockingWrapperLockHandoff({
    consumerId,
    ownerId,
    ownerPid,
    token,
    runId,
    rootRunId,
    parentRunId,
  });
  const lockData = {
    wrapperId: consumerId,
    pid: process.pid,
    runId: existing.handoff?.runId ?? null,
    rootRunId: existing.handoff?.rootRunId ?? existing.rootRunId ?? existing.runId ?? null,
    parentRunId: existing.handoff?.parentRunId ?? existing.runId ?? null,
    startedAt: existing.startedAt,
    handoffFrom: {
      wrapperId: ownerId,
      pid: ownerPid,
    },
    claimedAt: new Date().toISOString(),
  };
  writeAtomicLockFile(absolutePath, lockData);

  return {
    release() {
      const current = readLockFile(absolutePath);
      if (current?.pid === process.pid && current?.wrapperId === consumerId) {
        fs.rmSync(absolutePath, { force: true });
      }
    },
  };
}

export function acquireBlockingWrapperLock(
  wrapperId,
  { runId = null, rootRunId = null, parentRunId = null } = {}
) {
  const absolutePath = fromRelativePath(LOCK_PATH);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  while (true) {
    try {
      const lockData = {
        wrapperId,
        pid: process.pid,
        runId,
        rootRunId: rootRunId ?? runId,
        parentRunId,
        startedAt: new Date().toISOString(),
      };
      writeAtomicLockFile(absolutePath, lockData, { exclusive: true });

      return {
        release() {
          const existing = readLockFile(absolutePath);
          if (existing?.pid === process.pid && existing?.wrapperId === wrapperId) {
            fs.rmSync(absolutePath, { force: true });
          }
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const existing = readLockFile(absolutePath);
      if (!existing || !isPidAlive(existing.pid)) {
        fs.rmSync(absolutePath, { force: true });
        continue;
      }

      throw createLockError(existing);
    }
  }
}
