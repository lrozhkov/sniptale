import { useEffect, useRef, useState } from 'react';
import { useBackgroundCatalog } from '../../../../composition/background-resources/catalog';
import {
  readBundledBackground,
  readLibraryBackground,
} from '../../../../composition/background-resources/acquisition';
import { blobToDataUrl } from '../../../../platform/media-utils/data-url';
import { useEditorStore } from '../../../state/useEditorStore';
import { changeFrameBackgroundMode } from './settings';
import type { EditorInspectorFramePanelProps } from '../types';

/** Acquire a default image before accepting the mode, so one user choice is one history edit. */
export function useDefaultFrameBackgroundImage(
  props: Pick<EditorInspectorFramePanelProps, 'frameDraft' | 'setFrameDraft' | 'setBackgroundMode'>
) {
  const catalog = useBackgroundCatalog();
  const sessionId = useEditorStore((state) => state.sessionId);
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setBusy(false);
    setFailed(false);
    return () => {
      running.current?.abort();
      running.current = null;
    };
  }, [sessionId]);
  const first = catalog.presets.find((item) => item.enabled && item.available);
  const select = (mode: Parameters<typeof props.setBackgroundMode>[0]) => {
    running.current?.abort();
    running.current = null;
    setBusy(false);
    setFailed(false);
    if (mode !== 'image' || props.frameDraft.backgroundImageData || !first) {
      props.setBackgroundMode(mode);
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    void (async () => {
      try {
        const image = first.mediaId
          ? await readLibraryBackground(first.mediaId, controller.signal)
          : await readBundledBackground(first.id, controller.signal);
        const backgroundImageData = await blobToDataUrl(image.file);
        controller.signal.throwIfAborted();
        if (useEditorStore.getState().sessionId !== sessionId) return;
        props.setFrameDraft((frame) => ({
          ...changeFrameBackgroundMode(frame, 'image'),
          backgroundImageData,
        }));
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (running.current === controller) {
          running.current = null;
          setBusy(false);
        }
      }
    })();
  };
  return {
    select,
    pending: busy || (catalog.status === 'loading' && !props.frameDraft.backgroundImageData),
    failed,
  };
}
