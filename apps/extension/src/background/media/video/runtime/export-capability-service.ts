import {
  createProjectExportCapabilityContext,
  type ProjectExportCapability,
  type ProjectExportCapabilityPersistedStore,
  type ProjectExportCapabilityPurpose,
  resolveProjectExportCapabilityScope,
} from '../../../storage/video/project-export-capabilities';
import {
  isCapabilityContextAuthorized,
  resolveCapabilityOrigin,
} from '@sniptale/platform/security/capability-context';
import { requirePolicyStateTtlMs } from '../../../routing-contracts/capabilities/policy/ttl';
import {
  projectExportCapabilityPolicyState,
  type ProjectExportCapabilityService,
} from './export-capability-service-types';
import { createProjectExportSettingsFingerprint } from './export-settings-fingerprint';

type ProjectExportCapabilityServiceState = {
  capabilitiesCache: Map<string, ProjectExportCapability>;
  invalidatedTokens: Set<string>;
  mutationQueue: Promise<void>;
  now: () => number;
  persistedStore: ProjectExportCapabilityPersistedStore;
  randomId: () => string;
};

export function createProjectExportCapabilityService(args: {
  now: () => number;
  persistedStore: ProjectExportCapabilityPersistedStore;
  randomId: () => string;
}): ProjectExportCapabilityService {
  const state: ProjectExportCapabilityServiceState = {
    capabilitiesCache: new Map<string, ProjectExportCapability>(),
    invalidatedTokens: new Set<string>(),
    mutationQueue: Promise.resolve(),
    now: args.now,
    persistedStore: args.persistedStore,
    randomId: args.randomId,
  };

  return {
    clearCacheForTests: () => clearProjectExportCapabilityCache(state),
    consumeProjectExportCancelCapability: (consumeArgs) =>
      consumeProjectExportCapability(state, {
        ...consumeArgs,
        purpose: 'cancel-project-export',
      }),
    consumeProjectExportStartCapability: (consumeArgs) =>
      consumeProjectExportCapability(state, {
        ...consumeArgs,
        purpose: 'start-project-export',
        settingsFingerprint: createProjectExportSettingsFingerprint(consumeArgs.settings),
      }),
    issueProjectExportCancelCapability: (issueArgs) =>
      issueProjectExportCapability(state, {
        ...issueArgs,
        purpose: 'cancel-project-export',
      }),
    issueProjectExportStartCapability: (issueArgs) =>
      issueProjectExportCapability(state, {
        ...issueArgs,
        purpose: 'start-project-export',
        settingsFingerprint: createProjectExportSettingsFingerprint(issueArgs.settings),
      }),
    resetForTests: () => resetProjectExportCapabilityServiceForTests(state),
  };
}

function pruneExpiredProjectExportCapabilities(
  state: ProjectExportCapabilityServiceState,
  capabilities: Map<string, ProjectExportCapability>
): Map<string, ProjectExportCapability> {
  const next = new Map<string, ProjectExportCapability>();
  const nowEpochMs = state.now();
  for (const [token, capability] of capabilities) {
    if (capability.expiresAt > nowEpochMs) {
      next.set(token, capability);
    }
  }
  return next;
}

async function mutateProjectExportCapabilities<T>(
  state: ProjectExportCapabilityServiceState,
  mutate: (capabilities: Map<string, ProjectExportCapability>) => Promise<T>
): Promise<T> {
  const operation = state.mutationQueue.then(async () => {
    const capabilities = pruneExpiredProjectExportCapabilities(
      state,
      await state.persistedStore.read(state.capabilitiesCache)
    );
    const result = await mutate(capabilities);
    await state.persistedStore.write(state.capabilitiesCache, capabilities);
    return result;
  });
  state.mutationQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function issueProjectExportCapability(
  state: ProjectExportCapabilityServiceState,
  issueArgs: {
    documentId: string;
    jobId: string;
    purpose: ProjectExportCapabilityPurpose;
    senderUrl: string;
    settingsFingerprint?: string;
  }
): Promise<string> {
  return mutateProjectExportCapabilities(state, async (capabilities) => {
    const token = state.randomId();
    const expiresAt =
      state.now() + requirePolicyStateTtlMs(projectExportCapabilityPolicyState.policyStateId);
    deleteMatchingProjectExportCapabilities(capabilities, issueArgs);
    capabilities.set(token, {
      capabilityContext: createProjectExportCapabilityContext({
        expiresAt,
        purpose: issueArgs.purpose,
        senderUrl: issueArgs.senderUrl,
        token,
      }),
      documentId: issueArgs.documentId,
      expiresAt,
      generation: state.randomId(),
      jobId: issueArgs.jobId,
      purpose: issueArgs.purpose,
      senderUrl: issueArgs.senderUrl,
      ...(issueArgs.settingsFingerprint === undefined
        ? {}
        : { settingsFingerprint: issueArgs.settingsFingerprint }),
    });
    return token;
  });
}

function deleteMatchingProjectExportCapabilities(
  capabilities: Map<string, ProjectExportCapability>,
  args: {
    documentId: string;
    jobId: string;
    purpose: ProjectExportCapabilityPurpose;
    senderUrl: string;
  }
): void {
  for (const [existingToken, capability] of capabilities) {
    if (
      capability.documentId === args.documentId &&
      capability.jobId === args.jobId &&
      capability.purpose === args.purpose &&
      capability.senderUrl === args.senderUrl
    ) {
      capabilities.delete(existingToken);
    }
  }
}

async function consumeProjectExportCapability(
  state: ProjectExportCapabilityServiceState,
  consumeArgs: {
    documentId: string;
    jobId: string;
    purpose: ProjectExportCapabilityPurpose;
    senderUrl: string;
    settingsFingerprint?: string;
    token: string;
  }
): Promise<boolean> {
  const wasAlreadyInvalidated = state.invalidatedTokens.has(consumeArgs.token);
  state.invalidatedTokens.add(consumeArgs.token);
  try {
    const authorized = await mutateProjectExportCapabilities(state, async (capabilities) => {
      deleteInvalidatedProjectExportCapabilities(state, capabilities, {
        token: consumeArgs.token,
        wasAlreadyInvalidated,
      });
      if (wasAlreadyInvalidated) {
        return false;
      }
      const capability = capabilities.get(consumeArgs.token);
      capabilities.delete(consumeArgs.token);
      return isProjectExportCapabilityAuthorized(capability, consumeArgs);
    });
    state.invalidatedTokens.delete(consumeArgs.token);
    return authorized;
  } catch (error) {
    state.capabilitiesCache.delete(consumeArgs.token);
    throw error;
  }
}

function deleteInvalidatedProjectExportCapabilities(
  state: ProjectExportCapabilityServiceState,
  capabilities: Map<string, ProjectExportCapability>,
  args: { token: string; wasAlreadyInvalidated: boolean }
): void {
  for (const token of state.invalidatedTokens) {
    if (token !== args.token || args.wasAlreadyInvalidated) {
      capabilities.delete(token);
    }
  }
}

function isProjectExportCapabilityAuthorized(
  capability: ProjectExportCapability | undefined,
  expected: {
    documentId: string;
    jobId: string;
    purpose: ProjectExportCapabilityPurpose;
    senderUrl: string;
    settingsFingerprint?: string;
    token: string;
  }
): boolean {
  return (
    capability !== undefined &&
    isCapabilityContextAuthorized(capability.capabilityContext, {
      origin: resolveCapabilityOrigin(expected.senderUrl),
      scope: resolveProjectExportCapabilityScope(expected.purpose),
      token: expected.token,
    }) &&
    capability.documentId === expected.documentId &&
    capability.jobId === expected.jobId &&
    capability.purpose === expected.purpose &&
    capability.senderUrl === expected.senderUrl &&
    capability.settingsFingerprint === expected.settingsFingerprint
  );
}

function clearProjectExportCapabilityCache(state: ProjectExportCapabilityServiceState): void {
  state.mutationQueue = Promise.resolve();
  state.capabilitiesCache.clear();
}

function resetProjectExportCapabilityServiceForTests(
  state: ProjectExportCapabilityServiceState
): void {
  state.mutationQueue = Promise.resolve();
  state.invalidatedTokens.clear();
  state.capabilitiesCache.clear();
  state.persistedStore.reset();
}
