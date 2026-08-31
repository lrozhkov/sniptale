import type { Ref } from 'react';
import { withOfflineSnapshotPolicy } from './document-policy';

export function WebSnapshotFrame(props: {
  iframeRef: Ref<HTMLIFrameElement>;
  documentUrl?: string | null;
  onLoad: () => void;
  srcDoc: string;
  title: string;
}) {
  const sharedProps = {
    ref: props.iframeRef,
    title: props.title,
    onLoad: props.onLoad,
    sandbox: 'allow-same-origin',
    className: 'h-full w-full border-0 bg-white',
  } as const;
  if (props.documentUrl) {
    return <iframe {...sharedProps} src={props.documentUrl} />;
  }
  return <iframe {...sharedProps} srcDoc={withOfflineSnapshotPolicy(props.srcDoc, false)} />;
}
