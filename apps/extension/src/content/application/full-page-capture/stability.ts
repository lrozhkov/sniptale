import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import { writeRootScroll } from './geometry';
import type { ScrollCaptureRoot } from './types';

const QUIET_MS = 150;
const POSITION_TIMEOUT_MS = 1_500;
const FONT_TIMEOUT_MS = 2_000;
const WARMUP_TIMEOUT_MS = 20_000;
const MAX_WARMUP_POSITIONS = 80;
const OVERLAP_CSS_PX = 64;

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Full-page capture page work was cancelled');
}

export async function waitForCaptureStability(signal?: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  await waitForDomQuiet(signal);
  throwIfAborted(signal);
  const visibleImages = Array.from(document.images).filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
  });
  await Promise.race([
    Promise.allSettled(visibleImages.map((image) => image.decode())).then(() => undefined),
    timeout(POSITION_TIMEOUT_MS),
  ]);
  throwIfAborted(signal);
}

function waitForDomQuiet(signal?: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let quietTimer = setTimeout(finish, QUIET_MS);
    const hardTimer = setTimeout(finish, POSITION_TIMEOUT_MS);
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, QUIET_MS);
    });
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      observer.disconnect();
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      observer.disconnect();
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error('Full-page capture page work was cancelled')
      );
    }
    signal?.addEventListener('abort', abort, { once: true });
    observer.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

function createPositions(extent: number, viewport: number): number[] {
  if (extent <= viewport) return [0];
  const step = Math.max(1, viewport - OVERLAP_CSS_PX);
  const positions: number[] = [];
  for (let offset = 0; offset < extent; offset += step) {
    positions.push(Math.min(offset, extent - viewport));
    if (positions.at(-1) === extent - viewport) break;
  }
  return positions;
}

export async function warmUpLazyContent(
  root: ScrollCaptureRoot,
  geometry: FullPageCaptureGeometry,
  heartbeat?: (() => void) | undefined,
  signal?: AbortSignal | undefined
): Promise<void> {
  throwIfAborted(signal);
  if ('fonts' in document) {
    await Promise.race([document.fonts.ready.then(() => undefined), timeout(FONT_TIMEOUT_MS)]);
    throwIfAborted(signal);
  }
  const startedAt = Date.now();
  let visited = 0;
  const xPositions =
    root.kind === 'element'
      ? createPositions(geometry.extentWidth, geometry.rootViewport.width)
      : [0];
  const yPositions = createPositions(geometry.extentHeight, geometry.rootViewport.height);
  for (const y of yPositions) {
    for (const x of xPositions) {
      if (visited >= MAX_WARMUP_POSITIONS || Date.now() - startedAt >= WARMUP_TIMEOUT_MS) {
        return;
      }
      throwIfAborted(signal);
      writeRootScroll(root, x, y);
      heartbeat?.();
      visited += 1;
      await waitForCaptureStability(signal);
      throwIfAborted(signal);
      heartbeat?.();
    }
  }
}
