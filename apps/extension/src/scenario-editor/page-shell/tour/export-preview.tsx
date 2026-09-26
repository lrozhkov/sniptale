import { useEffect, useRef, useState } from 'react';
import {
  readScenarioPreviewStatus,
  type TourPreviewMessage,
} from '../../../features/scenario/tour-player/preview-contract';
import { createTranslator, useAppLocale } from '../../../platform/i18n';

/** A per-mount capability binds the immutable artifact to one opaque sandbox receiver. */
export function TourExportPreview({
  blob,
  title,
  mode = 'tour',
}: {
  blob: Blob;
  title: string;
  mode?: 'guide' | 'tour';
}) {
  const [nonce] = useState(() => crypto.randomUUID());
  const frame = useRef<HTMLIFrameElement>(null);
  const t = createTranslator(useAppLocale());
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    const timeout = window.setTimeout(() => setStatus('failed'), 15000);
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'null') return;
      const next = readScenarioPreviewStatus(event.data, nonce);
      if (!next) return;
      window.clearTimeout(timeout);
      setStatus(next);
    };
    window.addEventListener('message', receive);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, [nonce]);
  return (
    <>
      {status !== 'ready' && (
        <p role={status === 'failed' ? 'alert' : 'status'}>
          {t(
            status === 'failed' ? 'scenario.editor.viewFrameFailed' : 'scenario.editor.viewLoading'
          )}
        </p>
      )}
      {status !== 'failed' && (
        <iframe
          ref={frame}
          title={title}
          src={`/apps/extension/src/tour-preview-sandbox/index.html#${nonce}`}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          allow="autoplay"
          onLoad={(event) => {
            const message: TourPreviewMessage = { kind: 'tour-preview', mode, nonce, blob };
            event.currentTarget.contentWindow?.postMessage(message, '*');
          }}
        />
      )}
    </>
  );
}
