import { useState } from 'react';
import type { TourPreviewMessage } from '../../../features/scenario/tour-player/preview-contract';

/** A per-mount capability binds the immutable artifact to one opaque sandbox receiver. */
export function TourExportPreview({ blob, title }: { blob: Blob; title: string }) {
  const [nonce] = useState(() => crypto.randomUUID());
  return (
    <iframe
      title={title}
      src={`/apps/extension/src/tour-preview-sandbox/index.html#${nonce}`}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      allow="autoplay"
      onLoad={(event) => {
        const message: TourPreviewMessage = { kind: 'tour-preview', nonce, blob };
        event.currentTarget.contentWindow?.postMessage(message, '*');
      }}
    />
  );
}
