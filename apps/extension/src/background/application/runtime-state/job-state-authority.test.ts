import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { RUNTIME_JOB_STATE_AUTHORITY_MAP } from './job-state-authority';

function repoPath(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

it('points every runtime job state authority entry at existing owners', () => {
  for (const entry of RUNTIME_JOB_STATE_AUTHORITY_MAP) {
    expect(existsSync(repoPath(entry.authoritativeState.ownerModule))).toBe(true);
    expect(existsSync(repoPath(entry.reconciliationOwner.ownerModule))).toBe(true);
    expect(entry.authoritativeState.records.length).toBeGreaterThan(0);
    expect(entry.correlationKeys.length).toBeGreaterThan(0);
    expect(entry.readPathPolicy).not.toContain('write-on-read');
  }
});

it('keeps one authoritative state owner per runtime lifecycle family', () => {
  const ownerByLifecycle = new Map<string, string>();

  for (const entry of RUNTIME_JOB_STATE_AUTHORITY_MAP) {
    expect(ownerByLifecycle.has(entry.lifecycle)).toBe(false);
    ownerByLifecycle.set(entry.lifecycle, entry.authoritativeState.ownerModule);
  }

  expect([...ownerByLifecycle.keys()].sort()).toEqual([
    'capture-download',
    'offscreen-command',
    'project-export',
  ]);
});

it('makes job correlation explicit for job-backed runtime lifecycles', () => {
  const jobBackedEntries = RUNTIME_JOB_STATE_AUTHORITY_MAP.filter((entry) =>
    ['capture-download', 'project-export', 'offscreen-command'].includes(entry.lifecycle)
  );

  expect(jobBackedEntries).toHaveLength(3);
  for (const entry of jobBackedEntries) {
    expect(entry.correlationKeys).toContain('jobId');
  }

  expect(
    RUNTIME_JOB_STATE_AUTHORITY_MAP.find((entry) => entry.lifecycle === 'offscreen-command')
      ?.correlationKeys
  ).toEqual(['jobId', 'recordingId', 'desktopMediaRequestId', 'capabilityGeneration']);
});
