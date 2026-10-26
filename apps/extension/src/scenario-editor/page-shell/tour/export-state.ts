import { guideProjectContentIdentity } from '../runtime/content-identity';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';
import {
  prepareTourHtml,
  saveTourHtml,
  TourHtmlPreparationError,
  type TourHtmlBlocker,
  type PreparedTourHtml,
} from '../runtime/tour-html';
import type { TourHtmlImageOptions } from '../runtime/tour-html-images';
import { tourPlayerLabels } from './labels';

/** Owns preparation, invalidation and save lifetime; never persists settings. */
export function useTourHtmlExport(
  project: GuideProject,
  options: TourHtmlImageOptions,
  t: Translate
) {
  // Autosave acknowledgment changes object identity and timestamps without changing export content.
  const content = useMemo(() => guideProjectContentIdentity(project), [project]);
  const [prepared, setPrepared] = useState<{
    artifact: PreparedTourHtml;
    content: string;
    options: TourHtmlImageOptions;
    version: number;
  } | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'preparing' | 'saving' | 'failed' | 'saved' | 'history-failed'
  >('idle');
  const [blocker, setBlocker] = useState<TourHtmlBlocker | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const version = useRef(0);
  const current = useRef<AbortController | null>(null);
  const snapshot = useRef({ content, options });
  snapshot.current = { content, options };
  const ready = prepared?.content === content && prepared.options === options ? prepared : null;
  useEffect(() => {
    current.current?.abort();
    current.current = null;
    setPrepared(null);
    setStatus('idle');
    setBlocker(null);
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, [content, options]);
  const cancel = () => {
    current.current?.abort();
    current.current = null;
    setStatus('idle');
    setBlocker(null);
  };
  const run = async (save: boolean) => {
    if (current.current || (save && !ready)) return;
    const controller = new AbortController();
    current.current = controller;
    setStatus(save ? 'saving' : 'preparing');
    setBlocker(null);
    if (!save) setPrepared(null);
    const valid = () =>
      !controller.signal.aborted &&
      current.current === controller &&
      snapshot.current.content === content &&
      snapshot.current.options === options;
    try {
      if (save && ready) {
        const result = await saveTourHtml(ready.artifact, controller.signal);
        if (valid()) setStatus(result);
      } else {
        const artifact = await prepareTourHtml({
          project,
          options,
          labels: tourPlayerLabels(t),
          signal: controller.signal,
          onProgress: (done, total) => {
            if (valid()) setProgress({ done, total });
          },
        });
        if (!valid()) return;
        setPrepared({ artifact, content, options, version: ++version.current });
        setStatus('idle');
        setBlocker(null);
      }
    } catch (error) {
      if (valid()) {
        setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
        setBlocker(error instanceof TourHtmlPreparationError ? error.blocker : null);
      }
    } finally {
      if (current.current === controller) current.current = null;
    }
  };
  return {
    ready,
    status,
    blocker,
    progress,
    cancel,
    prepare: () => run(false),
    save: () => run(true),
  };
}
