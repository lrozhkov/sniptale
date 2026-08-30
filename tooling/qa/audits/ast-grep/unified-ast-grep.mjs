import { filterAstGrepAuditFiles, runAstGrepCheck } from './ast-grep.mjs';
import { AST_GREP_CORE_GROUP_IDS } from './ast-grep.rules.mjs';

export const UNIFIED_AST_GREP_RECEIPT_VERSION = 2;
let pendingAuditReceipt = null;

export function runUnifiedAstGrepReceipt({ files = [], runner = runAstGrepCheck } = {}) {
  const admittedFiles = filterAstGrepAuditFiles(files, AST_GREP_CORE_GROUP_IDS);
  if (admittedFiles.length === 0) {
    return {
      version: UNIFIED_AST_GREP_RECEIPT_VERSION,
      skipped: true,
      files: [],
      violations: [],
    };
  }
  const result = runner({ files: admittedFiles, groupIds: AST_GREP_CORE_GROUP_IDS });
  const receipt = Object.freeze({
    version: UNIFIED_AST_GREP_RECEIPT_VERSION,
    ...result,
    files: Object.freeze([...result.files]),
    violations: Object.freeze([...result.violations]),
  });
  pendingAuditReceipt = receipt;
  return receipt;
}

export function takeUnifiedAstGrepAuditReceipt() {
  const receipt = pendingAuditReceipt;
  pendingAuditReceipt = null;
  return receipt;
}

export function peekUnifiedAstGrepReceipt() {
  return pendingAuditReceipt;
}
