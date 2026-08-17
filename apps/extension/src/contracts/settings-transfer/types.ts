import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export type SettingsTransferJsonPrimitive = boolean | null | number | string;
export type SettingsTransferJsonValue =
  | SettingsTransferJsonPrimitive
  | SettingsTransferJsonValue[]
  | { [key: string]: SettingsTransferJsonValue };

export type SettingsTransferClassification =
  | 'transferable'
  | 'secret'
  | 'device-bound'
  | 'action/status';
export type SettingsTransferNodeKind = 'scalar' | 'collection' | 'item';
export type SettingsTransferStrategy = 'safe-merge' | 'overwrite-matching' | 'exact-restore';
export type SettingsTransferConflictDecision = 'keep-local' | 'use-imported' | 'import-as-copy';
export type SettingsTransferExportKind = 'backup' | 'selective';

export interface SettingsTransferDomainPayload {
  schemaVersion: number;
  data: SettingsTransferJsonValue;
}

export interface SettingsTransferPackageV1 {
  format: 'sniptale-settings';
  formatVersion: 1;
  exportKind: SettingsTransferExportKind;
  exportedAt: string;
  source: { appVersion: string };
  domains: Record<string, SettingsTransferDomainPayload>;
}

export interface SettingsTransferTreeNode {
  id: string;
  parentId: string | null;
  domainId: string;
  labelKey: string;
  descriptionKey: string;
  kind: SettingsTransferNodeKind;
  classification: SettingsTransferClassification;
  selectable: boolean;
  requiredBy: string[];
  children: SettingsTransferTreeNode[];
}

export interface SettingsTransferDynamicItem {
  collectionNodeId: string;
  id: string;
  label: string;
  dependencies?: string[];
}

export interface SettingsTransferConflict {
  id: string;
  nodeId: string;
  kind: 'scalar' | 'item';
  allowedDecisions: SettingsTransferConflictDecision[];
  defaultDecision: SettingsTransferConflictDecision;
}

export interface SettingsTransferChangeSummary {
  added: number;
  updated: number;
  copiedRemapped: number;
  unchanged: number;
  skipped: number;
  warnings: string[];
  clearedAiSecretBindings: string[];
  missingAiSecretBindings: string[];
}

export interface SettingsTransferInspection {
  fingerprint: string;
  package: SettingsTransferPackageV1;
  tree: SettingsTransferTreeNode[];
  conflicts: SettingsTransferConflict[];
  summary: SettingsTransferChangeSummary;
  exactRestoreAvailable: boolean;
}

export interface SettingsTransferCommitReport extends SettingsTransferChangeSummary {
  status: 'committed';
  strategy: SettingsTransferStrategy;
  appliedNodeIds: string[];
}

export type SettingsTransferOperation =
  | 'read-export-tree'
  | 'build-export-package'
  | 'inspect-import'
  | 'commit-import';

export type SettingsTransferMessage =
  | {
      type: typeof MessageType.SETTINGS_TRANSFER;
      operation: 'read-export-tree';
    }
  | {
      type: typeof MessageType.SETTINGS_TRANSFER;
      operation: 'build-export-package';
      exportKind: SettingsTransferExportKind;
      selectedNodeIds: string[];
    }
  | {
      type: typeof MessageType.SETTINGS_TRANSFER;
      operation: 'inspect-import';
      fileText: string;
    }
  | {
      type: typeof MessageType.SETTINGS_TRANSFER;
      operation: 'commit-import';
      fileText: string;
      strategy: SettingsTransferStrategy;
      selectedNodeIds: string[];
      decisions: Record<string, SettingsTransferConflictDecision>;
      fingerprint: string;
      destructiveConfirmed: boolean;
    };

export type SettingsTransferResponse =
  | { success: true; operation: 'read-export-tree'; tree: SettingsTransferTreeNode[] }
  | {
      success: true;
      operation: 'build-export-package';
      filename: string;
      fileText: string;
    }
  | {
      success: true;
      operation: 'inspect-import';
      inspection: SettingsTransferInspection;
    }
  | {
      success: true;
      operation: 'commit-import';
      report: SettingsTransferCommitReport;
    }
  | {
      success: false;
      operation: SettingsTransferOperation;
      errorCode:
        | 'invalid-package'
        | 'future-format'
        | 'unsupported-domain'
        | 'stale-plan'
        | 'quota-exceeded'
        | 'commit-failed'
        | 'rollback-failed'
        | 'unauthorized';
      error: string;
    };
