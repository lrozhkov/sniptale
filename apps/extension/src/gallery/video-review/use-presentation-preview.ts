import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import {
  preparePresentationPreview,
  renderPresentationPreview,
  type PresentationPreviewInput,
} from '../../workflows/video-review/presentation-preview';

type Selection = {
  edge: 'intro' | 'outro';
  selected: 'start' | 'join' | 'end';
  attempt: number;
  anchor: HTMLElement | null;
  revision: string;
  source: Blob;
};
/** Owns the disposable job and URL; main playback is paused once and never resumed implicitly. */
export function usePresentationPreview(
  input: PresentationPreviewInput | null,
  preferences: QuickPreviewPreferences,
  pause: () => void,
  render = renderPresentationPreview
) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [result, setResult] = useState<{ url: string | null; pending: boolean; error: boolean }>({
    url: null,
    pending: false,
    error: false,
  });
  const latest = useRef({ input, preferences, pause });
  latest.current = { input, preferences, pause };
  // Mutable UI objects are excluded; serialized render inputs form the immutable job identity.
  const revision = useMemo(
    () =>
      input
        ? JSON.stringify({
            index: input.index,
            advanced: input.advanced,
            edits: input.edits,
            comments: input.comments,
            clickCues: input.clickCues,
            keyCues: input.keyCues,
            settings: input.renderSettings,
            preferences,
          })
        : '',
    [input, preferences]
  );
  const source = input?.file;
  useEffect(() => {
    const { input: currentInput, preferences: currentPreferences } = latest.current;
    if (
      !selection ||
      !currentInput ||
      selection.revision !== revision ||
      selection.source !== source
    ) {
      if (selection) setSelection(null);
      setResult({ url: null, pending: false, error: false });
      return;
    }
    const controller = new AbortController();
    let url: string | null = null;
    setResult({ url: null, pending: true, error: false });
    try {
      const snapshot = {
        ...currentInput,
        advanced: structuredClone(currentInput.advanced),
        edits: structuredClone(currentInput.edits),
      };
      const plan = preparePresentationPreview(snapshot, selection.edge, currentPreferences);
      void render(snapshot, plan, selection.selected, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return;
          url = URL.createObjectURL(blob);
          setResult({ url, pending: false, error: false });
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ url: null, pending: false, error: true });
        });
    } catch {
      setResult({ url: null, pending: false, error: true });
    }
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // The fingerprint deliberately avoids incidental object identity cancelling a live job.
  }, [selection, revision, render, source]);
  let plan: ReturnType<typeof preparePresentationPreview> | null = null;
  if (selection && input) {
    try {
      plan = preparePresentationPreview(input, selection.edge, preferences);
    } catch {
      /* Presented by job state. */
    }
  }
  return {
    selection,
    result,
    plan,
    open(edge: 'intro' | 'outro') {
      const current = latest.current;
      if (!current.input) return;
      current.pause();
      let selected: 'start' | 'join' | 'end' = edge === 'intro' ? 'start' : 'end';
      try {
        const windows = preparePresentationPreview(
          current.input,
          edge,
          current.preferences
        ).windows;
        if (windows.some((value) => value.name === 'join')) selected = 'join';
      } catch {
        /* Retry stays available. */
      }
      setSelection({
        edge,
        selected,
        attempt: 0,
        revision,
        source: current.input.file,
        anchor: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      });
    },
    select(selected: Selection['selected']) {
      setSelection((value) => (value ? { ...value, selected } : null));
    },
    retry() {
      setSelection((value) => (value ? { ...value, attempt: value.attempt + 1 } : null));
    },
    close() {
      setSelection(null);
    },
  };
}
