const OFFLINE_SNAPSHOT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
  'img-src blob: data:',
  'font-src blob: data:',
  "style-src 'unsafe-inline' blob:",
  'media-src blob: data:',
].join('; ');

export function withOfflineSnapshotPolicy(source: string, xhtml: boolean): string {
  const meta = xhtml
    ? `<meta http-equiv="Content-Security-Policy" content="${OFFLINE_SNAPSHOT_CSP}" />`
    : `<meta http-equiv="Content-Security-Policy" content="${OFFLINE_SNAPSHOT_CSP}">`;
  const baselineAttribute = xhtml
    ? 'data-sniptale-viewer-baseline="true"'
    : 'data-sniptale-viewer-baseline';
  const baseline = `<style ${baselineAttribute}>@layer sniptale-viewer-baseline{body{font-size:initial}}</style>`;
  const lower = source.toLowerCase();
  const headIndex = lower.indexOf('<head');
  const suffix = headIndex < 0 ? '' : (lower[headIndex + 5] ?? '');
  const headEnd = suffix === '>' || suffix.trim() === '' ? lower.indexOf('>', headIndex + 5) : -1;
  if (headIndex < 0 || headEnd < 0) return `${meta}${baseline}${source}`;
  return `${source.slice(0, headEnd + 1)}${meta}${baseline}${source.slice(headEnd + 1)}`;
}
