import { quickEditWindowHeaderSize } from '../../features/video/review/advanced/window-header';
import { composeExactBrowserFrameSvg } from '../../features/browser-frame/compositor';
import type { QuickEditWindowHeader } from '../../features/video/review/advanced/types';

/** Local artwork only: title and address are escaped by the shared compositor, with no remote resources. */
export function reviewWindowHeaderUrl(header: QuickEditWindowHeader, width: number): string {
  const size = quickEditWindowHeaderSize(width);
  const svg = composeExactBrowserFrameSvg({
    ...size,
    headerHeight: size.height,
    contentHeight: 0,
    radius: 0,
    title: header.title,
    url: header.url?.trim() || null,
  });
  // Even output rows and preview snapping can stretch the header slightly. Fill that
  // exact rectangle so SVG aspect fitting cannot open a seam above the video.
  const fitted = svg.replace('<svg ', '<svg preserveAspectRatio="none" ');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fitted)}`;
}

/** The caller owns cancellation and the decoded image; no URL or persisted asset is acquired. */
export async function loadReviewWindowHeader(
  url: string,
  signal: AbortSignal
): Promise<HTMLImageElement> {
  signal.throwIfAborted();
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const clean = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      clean();
      image.src = '';
      reject(signal.reason);
    };
    image.onload = () => {
      clean();
      resolve();
    };
    image.onerror = () => {
      clean();
      reject(new Error('Window header is unavailable.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
  signal.throwIfAborted();
  return image;
}
