import { PRODUCT_SOURCE_ROOTS } from '../core/quality.config.mjs';

export const AST_GREP_GROUPS = {
  'browser-adapters': {
    label: 'Browser adapters',
    policyModule: './browser-adapters.mjs',
  },
  messaging: {
    label: 'Messaging',
    policyModule: './messaging.mjs',
  },
};

export const EXTERNAL_AUDIT_SCAN_TARGETS = [...PRODUCT_SOURCE_ROOTS, 'tooling'];
export const KNIP_CONFIG_PATH = 'tooling/configs/qa/knip.json';
export const JSCPD_CONFIG_PATH = 'tooling/configs/qa/jscpd.json';
export const JSCPD_BASELINE_PATH = 'tooling/configs/qa/jscpd-baseline.json';
export const SEMGREP_RULES_PATH = 'tooling/configs/qa/semgrep.yml';
export const CODEQL_CONFIG_PATH = 'tooling/configs/qa/codeql-config.yml';
export const CODEQL_BASELINE_PATH = 'tooling/configs/qa/codeql-baseline.json';
export const GITLEAKS_CONFIG_PATH = 'tooling/configs/qa/gitleaks.toml';
export const GITLEAKS_BASELINE_PATH = 'tooling/configs/qa/gitleaks-baseline.json';
export const LICENSE_POLICY_PATH = 'tooling/configs/qa/licenses.json';

export function isExternalAuditTestLikeFile(relativePath) {
  const normalizedPath = String(relativePath ?? '').replaceAll('\\', '/');
  return (
    /(?:^|\/)(?:test-support|fixtures)(?:\/|$)/u.test(normalizedPath) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalizedPath) ||
    /\.(?:test|spec)\.(?:fixture|fixtures|helpers|support)\.[cm]?[jt]sx?$/u.test(normalizedPath) ||
    /\.(?:fixture|fixtures|test[.-]helpers|test-support)\.[cm]?[jt]sx?$/u.test(normalizedPath) ||
    /(?:^|\/)(?:test-helpers|test-support)\.[cm]?[jt]sx?$/u.test(normalizedPath)
  );
}
