// policyStateIds: [] - response key and value sets are immutable IPC validation policy.
import type {
  SettingsTransferChangeSummary,
  SettingsTransferConflict,
  SettingsTransferResponse,
  SettingsTransferTreeNode,
} from '../../../../settings-transfer';
import {
  parseSettingsTransferPackageText,
  SETTINGS_TRANSFER_MAX_BYTES,
  SETTINGS_TRANSFER_MAX_DEPTH,
  SETTINGS_TRANSFER_MAX_JSON_NODES,
} from '../../../../settings-transfer';
import { isBoolean, isNumber, isRecord, isString } from '../../../validators';

const OPERATIONS = new Set([
  'read-export-tree',
  'build-export-package',
  'inspect-import',
  'commit-import',
]);
const ERROR_CODES = new Set([
  'invalid-package',
  'future-format',
  'unsupported-domain',
  'stale-plan',
  'quota-exceeded',
  'commit-failed',
  'rollback-failed',
  'unauthorized',
]);
const STRATEGIES = new Set(['safe-merge', 'overwrite-matching', 'exact-restore']);
const DECISIONS = new Set(['keep-local', 'use-imported', 'import-as-copy']);

export function isSettingsTransferResponse(value: unknown): value is SettingsTransferResponse {
  if (
    !isRecord(value) ||
    !isBoolean(value['success']) ||
    !OPERATIONS.has(String(value['operation']))
  ) {
    return false;
  }
  if (!value['success']) {
    return (
      hasExactKeys(value, ['success', 'operation', 'errorCode', 'error']) &&
      ERROR_CODES.has(String(value['errorCode'])) &&
      isBoundedString(value['error'], 4_096)
    );
  }
  switch (value['operation']) {
    case 'read-export-tree':
      return hasExactKeys(value, ['success', 'operation', 'tree']) && isTransferTree(value['tree']);
    case 'build-export-package':
      return (
        hasExactKeys(value, ['success', 'operation', 'filename', 'fileText']) &&
        isBoundedString(value['filename'], 256) &&
        isTransferPackageText(value['fileText'])
      );
    case 'inspect-import':
      return (
        hasExactKeys(value, ['success', 'operation', 'inspection']) &&
        isInspection(value['inspection'])
      );
    case 'commit-import':
      return hasExactKeys(value, ['success', 'operation', 'report']) && isReport(value['report']);
    default:
      return false;
  }
}

function isInspection(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'fingerprint',
      'package',
      'tree',
      'conflicts',
      'summary',
      'exactRestoreAvailable',
    ]) ||
    !isSha256(value['fingerprint']) ||
    !isTransferPackage(value['package']) ||
    !isTransferTree(value['tree']) ||
    !Array.isArray(value['conflicts']) ||
    value['conflicts'].length > SETTINGS_TRANSFER_MAX_JSON_NODES ||
    !value['conflicts'].every(isConflict) ||
    !isExactSummary(value['summary']) ||
    !isBoolean(value['exactRestoreAvailable'])
  ) {
    return false;
  }
  return true;
}

function isReport(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, [...summaryKeys, 'status', 'strategy', 'appliedNodeIds']) &&
    isSummary(value) &&
    value['status'] === 'committed' &&
    STRATEGIES.has(String(value['strategy'])) &&
    isStringArray(value['appliedNodeIds'])
  );
}

const summaryKeys = [
  'added',
  'updated',
  'copiedRemapped',
  'unchanged',
  'skipped',
  'warnings',
  'clearedAiSecretBindings',
  'missingAiSecretBindings',
] as const;

function isSummary(value: unknown): value is SettingsTransferChangeSummary {
  if (!isRecord(value) || !summaryKeys.every((key) => key in value)) return false;
  return (
    ['added', 'updated', 'copiedRemapped', 'unchanged', 'skipped'].every((key) =>
      isCount(value[key])
    ) &&
    isStringArray(value['warnings']) &&
    isStringArray(value['clearedAiSecretBindings']) &&
    isStringArray(value['missingAiSecretBindings'])
  );
}

function isExactSummary(value: unknown): value is SettingsTransferChangeSummary {
  return isRecord(value) && hasExactKeys(value, summaryKeys) && isSummary(value);
}

function isConflict(value: unknown): value is SettingsTransferConflict {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'nodeId', 'kind', 'allowedDecisions', 'defaultDecision']) &&
    isBoundedString(value['id'], 512) &&
    isBoundedString(value['nodeId'], 512) &&
    (value['kind'] === 'scalar' || value['kind'] === 'item') &&
    Array.isArray(value['allowedDecisions']) &&
    value['allowedDecisions'].length > 0 &&
    value['allowedDecisions'].every((decision) => DECISIONS.has(String(decision))) &&
    DECISIONS.has(String(value['defaultDecision'])) &&
    value['allowedDecisions'].includes(value['defaultDecision'])
  );
}

function isTransferTree(value: unknown): value is SettingsTransferTreeNode[] {
  if (!Array.isArray(value)) return false;
  let count = 0;
  const pending = (value as unknown[]).map((node) => ({ node, depth: 1 }));
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || ++count > SETTINGS_TRANSFER_MAX_JSON_NODES) return false;
    if (current.depth > SETTINGS_TRANSFER_MAX_DEPTH || !isTreeNode(current.node)) return false;
    for (const child of current.node['children']) {
      pending.push({ node: child, depth: current.depth + 1 });
    }
  }
  return true;
}

function isTreeNode(value: unknown): value is SettingsTransferTreeNode {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'id',
      'parentId',
      'domainId',
      'labelKey',
      'descriptionKey',
      'kind',
      'classification',
      'selectable',
      'requiredBy',
      'children',
    ]) &&
    isBoundedString(value['id'], 512) &&
    (value['parentId'] === null || isBoundedString(value['parentId'], 512)) &&
    isBoundedString(value['domainId'], 128) &&
    isBoundedString(value['labelKey'], 512) &&
    isBoundedString(value['descriptionKey'], 512) &&
    (value['kind'] === 'scalar' || value['kind'] === 'collection' || value['kind'] === 'item') &&
    (value['classification'] === 'transferable' ||
      value['classification'] === 'secret' ||
      value['classification'] === 'device-bound' ||
      value['classification'] === 'action/status') &&
    isBoolean(value['selectable']) &&
    isStringArray(value['requiredBy']) &&
    Array.isArray(value['children'])
  );
}

function isTransferPackage(value: unknown): boolean {
  try {
    parseSettingsTransferPackageText(JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isTransferPackageText(value: unknown): value is string {
  if (!isBoundedFileText(value)) return false;
  try {
    parseSettingsTransferPackageText(value);
    return true;
  } catch {
    return false;
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SETTINGS_TRANSFER_MAX_JSON_NODES &&
    value.every((item) => isBoundedString(item, 512))
  );
}

function isCount(value: unknown): boolean {
  return isNumber(value) && Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value: unknown): boolean {
  return isString(value) && /^[0-9a-f]{64}$/u.test(value);
}

function isBoundedFileText(value: unknown): value is string {
  return (
    isString(value) && new TextEncoder().encode(value).byteLength <= SETTINGS_TRANSFER_MAX_BYTES
  );
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return isString(value) && value.length > 0 && value.length <= maxLength;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}
