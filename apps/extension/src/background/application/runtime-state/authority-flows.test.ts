import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { RUNTIME_STATE_AUTHORITY_FLOWS, type RuntimeStateAuthorityFlowId } from './authority-flows';

const EXPECTED_STAGE_3_FLOW_IDS = [
  'ai-egress-lease',
  'capture-download',
  'diagnostics-session',
  'editor-bootstrap',
  'offscreen-command',
  'page-access-activation',
  'page-style-runtime',
  'popup-export',
  'privacy-erasure',
  'project-export',
  'scenario-mutation',
  'video-recording',
  'web-snapshot-save',
] as const satisfies readonly RuntimeStateAuthorityFlowId[];

function repoPath(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

it('covers every named Stage 3 runtime state authority flow', () => {
  expect(RUNTIME_STATE_AUTHORITY_FLOWS.map((entry) => entry.flowId).sort()).toEqual([
    ...EXPECTED_STAGE_3_FLOW_IDS,
  ]);
});

it('points runtime state authority flows at existing owners and proof modules', () => {
  for (const entry of RUNTIME_STATE_AUTHORITY_FLOWS) {
    expect(existsSync(repoPath(entry.ownerModule)), entry.flowId).toBe(true);
    expect(existsSync(repoPath(entry.cleanupOwnerModule)), entry.flowId).toBe(true);
    expect(entry.proofModules.length, entry.flowId).toBeGreaterThan(0);
    for (const proofModule of entry.proofModules) {
      expect(existsSync(repoPath(proofModule)), `${entry.flowId}: ${proofModule}`).toBe(true);
    }
  }
});

it('keeps state classification, restart behavior, and failure policy explicit', () => {
  for (const entry of RUNTIME_STATE_AUTHORITY_FLOWS) {
    expect(entry.authoritativeState.length, entry.flowId).toBeGreaterThan(0);
    expect(entry.correlationKeys.length, entry.flowId).toBeGreaterThan(0);
    expect(entry.restartBehavior, entry.flowId).not.toHaveLength(0);
    expect(entry.freshnessReplayPolicy, entry.flowId).not.toHaveLength(0);
    expect(entry.writeFailurePolicy, entry.flowId).not.toHaveLength(0);
    expect(entry.writeFailurePolicy, entry.flowId).not.toContain('write-on-read');
  }
});
