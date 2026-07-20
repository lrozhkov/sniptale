const SECURITY_CONTROL_FILE =
  /(?:security-|dependency-|source-sbom|semgrep|codeql|threat-model|manifest-permissions)/u;
const SECURITY_CONTROL_PROOF_HINT =
  'security/dependency policy changes require compact admission and guard fixtures; route review by changed seam';

export function collectSecurityControlHints(files) {
  return files.some((file) => SECURITY_CONTROL_FILE.test(file))
    ? [SECURITY_CONTROL_PROOF_HINT]
    : [];
}
