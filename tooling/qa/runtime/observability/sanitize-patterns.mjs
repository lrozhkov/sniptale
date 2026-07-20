const AUTH_PATTERN =
  /\b((?:authorization|proxy-authorization)\s*[:=]\s*)(?:basic|bearer)\s+[^\s,;]+/giu;
const COOKIE_PATTERN = /\b((?:set-)?cookie\s*:\s*)[^\r\n]+/giu;
const SECRET_ASSIGNMENT_PATTERNS = [
  /\b(api[-_]?key|password|passwd|secret|token)\s*[:=]\s*([^\s,;]+)/giu,
  /\b((?:access|refresh)[-_]?token|client[-_]?secret)\s*[:=]\s*([^\s,;]+)/giu,
];
const SECRET_QUERY_PATTERNS = [
  /([?&](?:api[-_]?key|password|secret|token|signature|sig)=)[^&#\s]+/giu,
  /([?&](?:(?:access|refresh)[-_]?token|x-(?:amz|goog)-signature)=)[^&#\s]+/giu,
  /([?&]x-amz-credential=)[^&#\s]+/giu,
];
const JSON_QUOTED_SECRET_PATTERNS = [
  /(["'](?:authorization|proxy-authorization|(?:set-)?cookie)["']\s*:\s*)(["'])(?:\\.|[^\\\r\n])*?\2/giu,
  /(["'](?:api[-_]?key|password|passwd|secret|token)["']\s*:\s*)(["'])(?:\\.|[^\\\r\n])*?\2/giu,
  /(["'](?:(?:access|refresh)[-_]?token|client[-_]?secret)["']\s*:\s*)(["'])(?:\\.|[^\\\r\n])*?\2/giu,
];
const KNOWN_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu;
const URL_CREDENTIAL_PATTERN = /(https?:\/\/)[^/@\s:]+:[^/@\s]+@/giu;

export function redactRecognizedSecretShapes(value) {
  let redacted = value;
  for (const pattern of JSON_QUOTED_SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '$1$2<redacted>$2');
  }
  redacted = redacted
    .replace(AUTH_PATTERN, '$1<redacted>')
    .replace(COOKIE_PATTERN, '$1<redacted>')
    .replace(KNOWN_TOKEN_PATTERN, '<redacted>')
    .replace(URL_CREDENTIAL_PATTERN, '$1<redacted>@');
  for (const pattern of SECRET_ASSIGNMENT_PATTERNS) {
    redacted = redacted.replace(pattern, '$1=<redacted>');
  }
  for (const pattern of SECRET_QUERY_PATTERNS) {
    redacted = redacted.replace(pattern, '$1<redacted>');
  }
  return redacted;
}
