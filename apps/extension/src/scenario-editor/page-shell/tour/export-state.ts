import { useEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../../platform/i18n';
import { prepareTourHtml, saveTourHtml, type PreparedTourHtml } from '../runtime/tour-html';
import type { TourHtmlImageOptions } from '../runtime/tour-html-images';
import { tourPlayerLabels } from './labels';

/** Owns preparation, invalidation and save lifetime; never persists settings. */
export function useTourHtmlExport(
  project: GuideProject,
  options: TourHtmlImageOptions,
  t: Translate
) {
  const [prepared, setPrepared] = useState<{
    artifact: PreparedTourHtml;
    project: GuideProject;
    options: TourHtmlImageOptions;
    version: number;
  } | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'preparing' | 'saving' | 'failed' | 'saved' | 'history-failed'
  >('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const version = useRef(0);
  const current = useRef<AbortController | null>(null);
  const snapshot = useRef({ project, options });
  snapshot.current = { project, options };
  const ready = prepared?.project === project && prepared.options === options ? prepared : null;
  useEffect(() => {
    current.current?.abort();
    current.current = null;
    setPrepared(null);
    setStatus('idle');
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, [project, options]);
  const cancel = () => {
    current.current?.abort();
    current.current = null;
    setStatus('idle');
  };
  const run = async (save: boolean) => {
    if (current.current || (save && !ready)) return;
    const controller = new AbortController();
    current.current = controller;
    setStatus(save ? 'saving' : 'preparing');
    if (!save) setPrepared(null);
    const valid = () =>
      !controller.signal.aborted &&
      current.current === controller &&
      snapshot.current.project === project &&
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
        setPrepared({ artifact, project, options, version: ++version.current });
        setStatus('idle');
      }
    } catch (error) {
      if (valid())
        setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
    } finally {
      if (current.current === controller) current.current = null;
    }
  };
  return { ready, status, progress, cancel, prepare: () => run(false), save: () => run(true) };
}
