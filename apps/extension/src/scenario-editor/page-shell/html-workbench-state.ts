import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type {
  GuideImageBlock,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { htmlImageRasterKey, resolveHtmlImageSettings } from './html-image-settings';
import { prepareHtmlImage } from './runtime/html-images';
import { exportGuideHtml, measureGuideHtml } from './runtime/html-export';

/** One disposable owner cancels obsolete measurements and file jobs on content change or exit. */
export function useHtmlExportJob(project: GuideProject, t: Translate) {
  const { updatedAt, ...content } = project;
  void updatedAt;
  const theme = document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
  const revision = JSON.stringify(
    [content, theme, t('scenario.editor.htmlImageOpen'), t('common.actions.close')],
    (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value
  );
  const [measurement, setMeasurement] = useState<{
    revision: string;
    result: Awaited<ReturnType<typeof measureGuideHtml>>;
  } | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'history-failed' | 'failed'>(
    'idle'
  );
  const job = useRef<AbortController | null>(null);
  useEffect(() => {
    setStatus('idle');
    return () => {
      job.current?.abort();
      job.current = null;
    };
  }, [revision]);
  const run = async (save: boolean) => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setStatus('pending');
    const args = {
      project,
      t,
      signal: controller.signal,
      theme: theme === 'dark' ? ('dark' as const) : ('light' as const),
    };
    try {
      if (save) {
        const result = await exportGuideHtml(args);
        if (job.current === controller) setStatus(result);
      } else {
        const result = await measureGuideHtml(args);
        if (job.current === controller) {
          setMeasurement({ revision, result });
          setStatus('idle');
        }
      }
    } catch (error) {
      if (job.current === controller)
        setStatus(
          controller.signal.aborted ||
            (error instanceof DOMException && error.name === 'AbortError')
            ? 'idle'
            : 'failed'
        );
    } finally {
      if (job.current === controller) job.current = null;
    }
  };
  return {
    status,
    measurement: measurement?.revision === revision ? measurement.result : null,
    run,
    cancel: () => job.current?.abort(),
  };
}

/** The selected encoded preview owns exactly one disposable URL and rejects stale native results. */
export function useHtmlImagePreview(project: GuideProject, block: GuideImageBlock | undefined) {
  const settings = resolveHtmlImageSettings(project, block);
  const key = block ? htmlImageRasterKey(block, settings) : '';
  const load = useEffectEvent((signal: AbortSignal) =>
    block ? prepareHtmlImage(block, settings, signal) : Promise.resolve(null)
  );
  const [preview, setPreview] = useState<{
    key: string;
    url: string;
    width: number;
    height: number;
    size: number;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    setPreview(null);
    setFailed(null);
    if (!key) return;
    const controller = new AbortController();
    let url: string | null = null;
    void load(controller.signal)
      .then((result) => {
        if (!result || controller.signal.aborted) return;
        url = URL.createObjectURL(result.blob);
        setPreview({ key, url, width: result.width, height: result.height, size: result.size });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(key);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key]);
  return { preview: preview?.key === key ? preview : null, failed: failed === key };
}
