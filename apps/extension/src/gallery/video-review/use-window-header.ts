import { useAppLocale, translate } from '../../platform/i18n';
import { useEffect, useState, useMemo } from 'react';
import type { QuickEditWindowHeader } from '../../features/video/review/advanced/types';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
} from '../../workflows/video-review/window-header';

/** A title change cannot publish an obsolete decoded header into the current preview. */
export function useReviewWindowHeader(header: QuickEditWindowHeader | undefined, width: number) {
  const locale = useAppLocale();
  const title = header
    ? header.title.trim() || translate('editor.runtime.newTab', locale)
    : undefined;
  const url = useMemo(
    () => (title === undefined ? null : reviewWindowHeaderUrl({ kind: 'browser', title }, width)),
    [title, width]
  );
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setFailedUrl(null);
    setLoaded(null);
    if (url)
      void loadReviewWindowHeader(url, controller.signal)
        .then((image) => {
          if (!controller.signal.aborted) setLoaded({ url, image });
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailedUrl(url);
        });
    return () => controller.abort();
  }, [url, attempt]);
  return {
    url,
    image: loaded?.url === url ? loaded.image : null,
    failed: url !== null && failedUrl === url,
    retry: () => setAttempt((value) => value + 1),
  };
}
