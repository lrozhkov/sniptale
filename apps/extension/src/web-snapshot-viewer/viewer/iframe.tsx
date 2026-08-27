import type { Ref } from 'react';

function withOfflineSnapshotCsp(srcDoc: string): string {
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "navigate-to 'none'",
    'img-src blob: data:',
    'font-src blob: data:',
    "style-src 'unsafe-inline' blob:",
    'media-src blob: data:',
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  // Chromium applies an extension-page stylesheet to about:srcdoc and otherwise shrinks an
  // unstyled body to 75%. Keep this baseline before captured page styles so the site's own body
  // rule remains authoritative while the browser's extension-only default is neutralized.
  const baseline =
    '<style data-sniptale-viewer-baseline>@layer sniptale-viewer-baseline{body{font-size:initial}}</style>';
  const lower = srcDoc.toLowerCase();
  const headIndex = lower.indexOf('<head');
  const suffix = headIndex < 0 ? '' : (lower[headIndex + 5] ?? '');
  const headEnd = suffix === '>' || suffix.trim() === '' ? lower.indexOf('>', headIndex + 5) : -1;
  if (headIndex < 0 || headEnd < 0) return `${meta}${baseline}${srcDoc}`;
  return `${srcDoc.slice(0, headEnd + 1)}${meta}${baseline}${srcDoc.slice(headEnd + 1)}`;
}

export function WebSnapshotFrame(props: {
  iframeRef: Ref<HTMLIFrameElement>;
  onLoad: () => void;
  srcDoc: string;
  title: string;
}) {
  return (
    <iframe
      ref={props.iframeRef}
      title={props.title}
      srcDoc={withOfflineSnapshotCsp(props.srcDoc)}
      onLoad={props.onLoad}
      sandbox="allow-same-origin"
      className="h-full w-full border-0 bg-white"
    />
  );
}
