import { useAppLocale, translate } from '../../platform/i18n';
import { useEffect, useState, useMemo } from 'react';
import type { QuickEditWindowHeader } from '../../features/video/review/advanced/types';
import {
  loadReviewWindowHeader,
  reviewWindowHeaderUrl,
} from '../../workflows/video-review/window-header';

/** A title or address change cannot publish an obsolete decoded header into the current preview. */
export function useReviewWindowHeader(header: QuickEditWindowHeader | undefined, width: number) {
  const locale = useAppLocale();
  const title = header
    ? header.title.trim() || translate('editor.runtime.newTab', locale)
    : undefined;
  const address = header?.url;
  const url = useMemo(
    () =>
      title === undefined
        ? null
        : reviewWindowHeaderUrl(
            { kind: 'browser', title, ...(address === undefined ? {} : { url: address }) },
            width
          ),
    [title, address, width]
  );
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ url: string; image: ImageBitmap } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let owned: ImageBitmap | null = null;
    setFailedUrl(null);
    setLoaded(null);
    if (url)
      void loadReviewWindowHeader(url, controller.signal)
        .then((image) => {
          if (controller.signal.aborted) image.close();
          else {
            owned = image;
            setLoaded({ url, image });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailedUrl(url);
        });
    return () => {
      controller.abort();
      owned?.close();
    };
  }, [url, attempt]);
  return {
    url,
    image: loaded?.url === url ? loaded.image : null,
    failed: url !== null && failedUrl === url,
    retry: () => setAttempt((value) => value + 1),
  };
}
