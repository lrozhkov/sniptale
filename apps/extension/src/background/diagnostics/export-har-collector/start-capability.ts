import {
  createCapabilityContext,
  isCapabilityContextAuthorized,
  resolveCapabilityOrigin,
} from '@sniptale/platform/security/capability-context';
import { createPrivilegedSyncMemoryDomain } from '../../routing-contracts/capabilities/privileged-authority/state';
import { acquireDiagnosticsMutationPermit } from '../lifecycle-gate';

const EXPORT_HAR_START_CAPABILITY_TTL_MS = 60 * 1000;

type ExportHarStartCapabilityRecord = {
  authorityGeneration: number;
  capabilityContext: ReturnType<typeof createCapabilityContext>;
  rawDiagnosticsEnabled: boolean;
  sessionId: string;
};

declare const exportHarStartPreauthorizationBrand: unique symbol;

export type ExportHarStartPreauthorization = {
  readonly [exportHarStartPreauthorizationBrand]: 'ExportHarStartPreauthorization';
};

type ExportHarStartPreauthorizationRecord = {
  authorityGeneration: number;
  rawDiagnosticsEnabled: boolean;
  sessionId: string;
  tabId: number;
};

type ExportHarStartAuthority = {
  rawDiagnosticsEnabled: boolean;
};

const exportHarStartCapabilities = createPrivilegedSyncMemoryDomain<ExportHarStartCapabilityRecord>(
  'background.privileged.export-har-start-capabilities'
);
const exportHarStartPreauthorizations = new WeakMap<
  ExportHarStartPreauthorization,
  ExportHarStartPreauthorizationRecord
>();
let authorityGeneration = 0;

function createHarStartCapabilityExpiry(nowEpochMs = Date.now()): number {
  return nowEpochMs + EXPORT_HAR_START_CAPABILITY_TTL_MS;
}

function createHarCapabilityToken(): string {
  return crypto.randomUUID();
}

export function issueExportHarStartCapability(args: {
  rawDiagnosticsEnabled?: boolean;
  senderUrl: string | undefined;
  sessionId: string;
  tabId: number;
}): string {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    throw new Error('HAR capability issuance rejected during local data erasure');
  }
  try {
    const token = createHarCapabilityToken();
    exportHarStartCapabilities.set(token, {
      authorityGeneration,
      capabilityContext: createCapabilityContext({
        expiresAtEpochMs: createHarStartCapabilityExpiry(),
        origin: resolveCapabilityOrigin(args.senderUrl),
        scopes: ['export:har:start'],
        tabId: args.tabId,
        token,
      }),
      rawDiagnosticsEnabled: args.rawDiagnosticsEnabled === true,
      sessionId: args.sessionId,
    });
    return token;
  } finally {
    releaseMutation();
  }
}

export function consumeExportHarStartCapability(args: {
  capabilityToken: string;
  senderUrl: string | undefined;
  sessionId: string;
  tabId: number;
}): ExportHarStartPreauthorization {
  const record = exportHarStartCapabilities.get(args.capabilityToken);
  exportHarStartCapabilities.delete(args.capabilityToken);
  if (
    !record ||
    record.authorityGeneration !== authorityGeneration ||
    record.sessionId !== args.sessionId ||
    !isCapabilityContextAuthorized(record.capabilityContext, {
      origin: resolveCapabilityOrigin(args.senderUrl),
      scope: 'export:har:start',
      tabId: args.tabId,
      token: args.capabilityToken,
    })
  ) {
    throw new Error(`HAR session "${args.sessionId}" rejected an invalid start capability token.`);
  }
  const preauthorization = {} as ExportHarStartPreauthorization;
  exportHarStartPreauthorizations.set(preauthorization, {
    authorityGeneration: record.authorityGeneration,
    rawDiagnosticsEnabled: record.rawDiagnosticsEnabled,
    sessionId: args.sessionId,
    tabId: args.tabId,
  });
  return preauthorization;
}

function consumeExportHarStartPreauthorization(args: {
  preauthorization: ExportHarStartPreauthorization;
  sessionId: string;
  tabId: number;
}): ExportHarStartAuthority {
  const record = exportHarStartPreauthorizations.get(args.preauthorization);
  exportHarStartPreauthorizations.delete(args.preauthorization);
  if (
    !record ||
    record.authorityGeneration !== authorityGeneration ||
    record.sessionId !== args.sessionId ||
    record.tabId !== args.tabId
  ) {
    throw new Error(`HAR session "${args.sessionId}" rejected an invalid start preauthorization.`);
  }
  return { rawDiagnosticsEnabled: record.rawDiagnosticsEnabled };
}

export function invalidateExportHarStartAuthorityForPrivacyErasure(): void {
  exportHarStartCapabilities.clear();
  authorityGeneration += 1;
}

export function consumeExportHarStartAuthorization(args: {
  senderUrl: string | undefined;
  sessionId: string;
  startAuthorization: string | ExportHarStartPreauthorization;
  tabId: number;
}): ExportHarStartAuthority {
  const preauthorization =
    typeof args.startAuthorization === 'string'
      ? consumeExportHarStartCapability({
          capabilityToken: args.startAuthorization,
          senderUrl: args.senderUrl,
          sessionId: args.sessionId,
          tabId: args.tabId,
        })
      : args.startAuthorization;

  return consumeExportHarStartPreauthorization({
    preauthorization,
    sessionId: args.sessionId,
    tabId: args.tabId,
  });
}
