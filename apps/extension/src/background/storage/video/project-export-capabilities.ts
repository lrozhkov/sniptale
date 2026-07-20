import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import {
  createCapabilityContext,
  resolveCapabilityOrigin,
  type CapabilityContext,
  type CapabilityScope,
} from '@sniptale/platform/security/capability-context';

export type ProjectExportCapabilityPurpose = 'cancel-project-export' | 'start-project-export';

export type ProjectExportCapability = {
  capabilityContext: CapabilityContext;
  documentId: string;
  expiresAt: number;
  generation: string;
  jobId: string;
  purpose: ProjectExportCapabilityPurpose;
  senderUrl: string;
  settingsFingerprint?: string;
};

export type ProjectExportCapabilityPersistedStore = {
  read(cache: Map<string, ProjectExportCapability>): Promise<Map<string, ProjectExportCapability>>;
  reset(): void;
  write(
    cache: Map<string, ProjectExportCapability>,
    capabilities: Map<string, ProjectExportCapability>
  ): Promise<void>;
};

type PersistedProjectExportCapability = ProjectExportCapability & {
  version: 1;
};

type PersistedProjectExportCapabilityStore = {
  records: Record<string, PersistedProjectExportCapability>;
  version: 1;
};

const PROJECT_EXPORT_CAPABILITY_STORAGE_KEY = 'video-project-export-capabilities';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canPersistProjectExportCapabilities(): boolean {
  return browserStorage.session.isAvailable();
}

function isProjectExportCapabilityPurpose(value: unknown): value is ProjectExportCapabilityPurpose {
  return value === 'cancel-project-export' || value === 'start-project-export';
}

export function resolveProjectExportCapabilityScope(
  purpose: ProjectExportCapabilityPurpose
): CapabilityScope {
  return purpose === 'start-project-export'
    ? 'export:video-project:start'
    : 'export:video-project:cancel';
}

export function createProjectExportCapabilityContext(args: {
  expiresAt: number;
  purpose: ProjectExportCapabilityPurpose;
  senderUrl: string;
  token: string;
}): CapabilityContext {
  return createCapabilityContext({
    expiresAtEpochMs: args.expiresAt,
    origin: resolveCapabilityOrigin(args.senderUrl),
    scopes: [resolveProjectExportCapabilityScope(args.purpose)],
    token: args.token,
  });
}

function parsePersistedProjectExportCapability(
  token: string,
  value: unknown,
  now = Date.now()
): ProjectExportCapability | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value['version'] !== 1 ||
    typeof value['documentId'] !== 'string' ||
    value['documentId'].length === 0 ||
    typeof value['expiresAt'] !== 'number' ||
    !Number.isFinite(value['expiresAt']) ||
    typeof value['generation'] !== 'string' ||
    typeof value['jobId'] !== 'string' ||
    !isProjectExportCapabilityPurpose(value['purpose']) ||
    typeof value['senderUrl'] !== 'string' ||
    value['expiresAt'] <= now
  ) {
    return null;
  }

  return {
    capabilityContext: createProjectExportCapabilityContext({
      expiresAt: value['expiresAt'],
      purpose: value['purpose'],
      senderUrl: value['senderUrl'],
      token,
    }),
    documentId: value['documentId'],
    expiresAt: value['expiresAt'],
    generation: value['generation'],
    jobId: value['jobId'],
    purpose: value['purpose'],
    senderUrl: value['senderUrl'],
    ...(typeof value['settingsFingerprint'] === 'string' && value['settingsFingerprint'].length > 0
      ? { settingsFingerprint: value['settingsFingerprint'] }
      : {}),
  };
}

function createPersistedProjectExportCapability(
  capability: ProjectExportCapability
): PersistedProjectExportCapability {
  return { ...capability, version: 1 };
}

function parsePersistedProjectExportCapabilityStore(
  value: unknown,
  now = Date.now()
): Map<string, ProjectExportCapability> {
  const records = new Map<string, ProjectExportCapability>();
  if (!isRecord(value)) {
    return records;
  }

  const rawRecords = value['records'];
  if (value['version'] !== 1 || !isRecord(rawRecords)) {
    return records;
  }

  for (const [token, rawCapability] of Object.entries(rawRecords)) {
    const capability = parsePersistedProjectExportCapability(token, rawCapability, now);
    if (capability) {
      records.set(token, capability);
    }
  }
  return records;
}

export async function readProjectExportCapabilities(
  cache: Map<string, ProjectExportCapability>
): Promise<Map<string, ProjectExportCapability>> {
  if (!canPersistProjectExportCapabilities()) {
    return new Map(cache);
  }

  const payload = await browserStorage.session.get([PROJECT_EXPORT_CAPABILITY_STORAGE_KEY]);
  return parsePersistedProjectExportCapabilityStore(payload[PROJECT_EXPORT_CAPABILITY_STORAGE_KEY]);
}

export async function writeProjectExportCapabilities(
  cache: Map<string, ProjectExportCapability>,
  capabilities: Map<string, ProjectExportCapability>
): Promise<void> {
  cache.clear();
  for (const [token, capability] of capabilities) {
    cache.set(token, capability);
  }

  if (!canPersistProjectExportCapabilities()) {
    return;
  }

  const records: PersistedProjectExportCapabilityStore['records'] = {};
  for (const [token, capability] of capabilities) {
    records[token] = createPersistedProjectExportCapability(capability);
  }

  await browserStorage.session.set({
    [PROJECT_EXPORT_CAPABILITY_STORAGE_KEY]: { records, version: 1 },
  });
}

export function resetPersistedProjectExportCapabilities(): void {
  if (canPersistProjectExportCapabilities()) {
    void browserStorage.session.remove(PROJECT_EXPORT_CAPABILITY_STORAGE_KEY);
  }
}

export const browserSessionProjectExportCapabilityStore: ProjectExportCapabilityPersistedStore = {
  read: readProjectExportCapabilities,
  reset: resetPersistedProjectExportCapabilities,
  write: writeProjectExportCapabilities,
};
