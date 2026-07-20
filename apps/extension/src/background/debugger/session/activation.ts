// policyStateIds: [] - debugger activation state is internal effect authority, not route policy.
import {
  createCapabilityContext,
  isCapabilityContextAuthorized,
} from '@sniptale/platform/security/capability-context';
import * as privilegedAuthority from '../../routing-contracts/capabilities/privileged-authority/state';
import type { DebuggerClient } from './store';

const DEBUGGER_ACTIVATION_TTL_MS = 30_000;

export type DebuggerActivationProof = {
  token: string;
};

type DebuggerActivationRecord = {
  client: DebuggerClient;
  context: ReturnType<typeof createCapabilityContext>;
  reason: string;
};

const debuggerActivations =
  privilegedAuthority.createPrivilegedSyncMemoryDomain<DebuggerActivationRecord>(
    'background.privileged.debugger-activations'
  );

export function armDebuggerActivation(args: {
  client: DebuggerClient;
  reason: string;
  tabId: number;
}): DebuggerActivationProof {
  const token = crypto.randomUUID();
  debuggerActivations.set(token, {
    client: args.client,
    context: createCapabilityContext({
      expiresAtEpochMs: Date.now() + DEBUGGER_ACTIVATION_TTL_MS,
      scopes: ['debugger:attach'],
      tabId: args.tabId,
      token,
    }),
    reason: args.reason,
  });
  return { token };
}

export function consumeDebuggerActivationProof(args: {
  client: DebuggerClient;
  proof: DebuggerActivationProof;
  tabId: number;
}): void {
  const record = debuggerActivations.get(args.proof.token);
  debuggerActivations.delete(args.proof.token);
  if (
    !record ||
    record.client !== args.client ||
    !isCapabilityContextAuthorized(record.context, {
      scope: 'debugger:attach',
      tabId: args.tabId,
      token: args.proof.token,
    })
  ) {
    throw new Error('Debugger attach rejected because activation proof is missing or stale.');
  }
}

export function resetDebuggerActivationsForTests(): void {
  debuggerActivations.clear();
}
