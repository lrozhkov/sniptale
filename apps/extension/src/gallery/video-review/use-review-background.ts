import { useEffect, useRef, useState } from 'react';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { importReviewBackgroundImage } from '../../workflows/video-review/background-image';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import type { useReviewAdvanced } from './use-advanced';

/** Import owns admission, pending state and cancellation; the session owns the durable edit. */
export function useReviewBackgroundImport(args: {
  advanced: ReturnType<typeof useReviewAdvanced>;
  session: ReturnType<
    typeof import('../../workflows/video-review/session').createVideoReviewSession
  >;
  allowed(): boolean;
}) {
  const running = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(
    () => () => {
      running.current?.abort();
    },
    []
  );
  const importImage = async (file: File) => {
    if (running.current || !args.allowed()) return;
    const controller = new AbortController();
    running.current = controller;
    setPending(true);
    setFailed(false);
    try {
      await args.advanced.flush();
      await importReviewBackgroundImage({
        file,
        signal: controller.signal,
        attach: async (assetId) => {
          controller.signal.throwIfAborted();
          const before = args.session.getSnapshot().document.advancedContent;
          await args.session.commit({
            id: crypto.randomUUID(),
            at: Date.now(),
            target: 'advancedContent',
            before,
            after: {
              ...before,
              background: updateQuickEditBackground(before.background, {
                enabled: true,
                type: 'image',
                assetId,
              }),
            },
          });
        },
      });
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      running.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return { importImage, pending, failed };
}

/** Resolves the background reference and revokes obsolete preview URLs on change or close. */
export function useReviewBackgroundImage(background: QuickEditBackgroundSettings, pending = false) {
  const id = background.enabled && background.type === 'image' ? background.assetId : null;
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    let url: string | null = null;
    setImage(null);
    setFailed(false);
    if (id && !pending)
      void resolveReviewAssetBytes(id)
        .then((blob) => {
          if (!current) return;
          if (!blob) throw new Error('Missing background.');
          url = URL.createObjectURL(blob);
          setImage({ id, url });
        })
        .catch(() => {
          if (current) setFailed(true);
        });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, attempt, pending]);
  return {
    url: image?.id === id ? image.url : undefined,
    failed,
    retry: () => setAttempt((value) => value + 1),
  };
}
