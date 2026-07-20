import type { Ref } from 'react';

function withOfflineSnapshotCsp(srcDoc: string): string {
  const csp = [
    "default-src 'none'",
    'img-src blob: data:',
    'font-src blob: data:',
    "style-src 'unsafe-inline' blob:",
    'media-src blob: data:',
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  return srcDoc.includes('<head>') ? srcDoc.replace('<head>', `<head>${meta}`) : `${meta}${srcDoc}`;
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
