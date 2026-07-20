import runtimeTopology from '../core/runtime-topology.data.json' with { type: 'json' };

export {
  BROWSER_ADAPTER_ALLOWED_PREFIXES,
  BROWSER_ADAPTER_RULES,
  BROADCAST_CHANNEL_OWNER_FILES,
  HISTORY_OWNER_FILES,
  isBrowserAdapterAllowedPath,
  isBrowserAdapterTestLikeFile,
  LOCAL_STORAGE_OWNER_FILES,
  normalizeBrowserAdapterPath,
} from './browser-adapters.mjs';
export {
  AST_GREP_GROUPS,
  CODEQL_BASELINE_PATH,
  CODEQL_CONFIG_PATH,
  EXTERNAL_AUDIT_SCAN_TARGETS,
  GITLEAKS_BASELINE_PATH,
  GITLEAKS_CONFIG_PATH,
  isExternalAuditTestLikeFile,
  JSCPD_BASELINE_PATH,
  JSCPD_CONFIG_PATH,
  KNIP_CONFIG_PATH,
  LICENSE_POLICY_PATH,
  SEMGREP_RULES_PATH,
} from './external-tools.mjs';
export { MESSAGING_RULES, isAllowlistedPath } from './messaging.mjs';
export const RUNTIME_TOPOLOGY = runtimeTopology;
