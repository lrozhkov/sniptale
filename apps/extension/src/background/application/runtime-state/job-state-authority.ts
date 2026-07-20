type RuntimeStateAuthorityEntry = {
  advisoryState: readonly string[];
  authoritativeState: {
    ownerModule: string;
    records: readonly string[];
    storage: string;
  };
  correlationKeys: readonly string[];
  disposableState: readonly string[];
  lifecycle: 'capture-download' | 'offscreen-command' | 'project-export';
  name: string;
  readPathPolicy: string;
  reconciliationOwner: {
    ownerModule: string;
    trigger: string;
  };
};

export const RUNTIME_JOB_STATE_AUTHORITY_MAP = [
  {
    advisoryState: ['capture download router pendingDownloads', 'browser downloads API item state'],
    authoritativeState: {
      ownerModule: 'apps/extension/src/background/capture/jobs/state-machine.ts',
      records: [
        'jobId',
        'state',
        'revision',
        'tabId',
        'downloadId',
        'runtimeGeneration',
        'offscreenGeneration',
      ],
      storage: 'background.capture.jobs stateManager IndexedDB domain',
    },
    correlationKeys: ['jobId', 'tabId', 'downloadId', 'runtimeGeneration', 'offscreenGeneration'],
    disposableState: ['captureGuardState', 'download terminal timeout handles'],
    lifecycle: 'capture-download',
    name: 'capture download job',
    readPathPolicy:
      'readCaptureJob is read-only; startup reconciliation owns repair/removal writes',
    reconciliationOwner: {
      ownerModule: 'apps/extension/src/background/capture/jobs/reconciliation.ts',
      trigger: 'service-worker startup hydration',
    },
  },
  {
    advisoryState: ['project export capability tokens', 'offscreen command completion promise'],
    authoritativeState: {
      ownerModule: 'apps/extension/src/composition/persistence/export-ledger/index.ts',
      records: [
        'jobId',
        'projectId',
        'status',
        'phase',
        'progress',
        'cancelRequested',
        'ownerDocumentId',
        'ownerSenderUrl',
      ],
      storage: 'browserStorage.session sniptale_project_export_active_job',
    },
    correlationKeys: ['jobId', 'projectId', 'ownerDocumentId', 'ownerSenderUrl'],
    disposableState: ['ledger write queue', 'offscreen export command response channel'],
    lifecycle: 'project-export',
    name: 'project export job',
    readPathPolicy: 'loadActiveProjectExportJobLedgerEntry parses only; handlers own writes',
    reconciliationOwner: {
      ownerModule: 'apps/extension/src/background/media/video/runtime/handlers/export/reconcile.ts',
      trigger: 'offscreen document creation after service-worker restart',
    },
  },
  {
    advisoryState: ['executedCommandKeys', 'runtime freshness nonce cache', 'rate-limit counters'],
    authoritativeState: {
      ownerModule: 'apps/extension/src/offscreen/runtime/idempotency.ts',
      records: ['commandType', 'generation', 'jobId', 'recordingId', 'desktopMediaRequestId'],
      storage: 'bounded in-memory offscreen command completion map',
    },
    correlationKeys: ['jobId', 'recordingId', 'desktopMediaRequestId', 'capabilityGeneration'],
    disposableState: ['tracked command promise', 'sendResponse closure'],
    lifecycle: 'offscreen-command',
    name: 'offscreen side-effect command',
    readPathPolicy: 'idempotency state mutates only after sender and freshness authorization',
    reconciliationOwner: {
      ownerModule: 'apps/extension/src/offscreen/runtime/index.ts',
      trigger: 'authorized offscreen runtime message dispatch',
    },
  },
] as const satisfies readonly RuntimeStateAuthorityEntry[];
