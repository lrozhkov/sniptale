import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';
import { writePageScroll } from '../../platform/page-scroll';
import type { ScrollCaptureRoot } from './types';
import { measureCaptureGeometry } from './geometry';

const QUIET_MS = 150;
const POSITION_TIMEOUT_MS = 1_500;
const FONT_TIMEOUT_MS = 2_000;
const WARMUP_TIMEOUT_MS = 20_000;
const MAX_WARMUP_POSITIONS = 80;
const WARMUP_PASSES = 2;
const MAX_WARMUP_POSITIONS_PER_PASS = Math.floor(MAX_WARMUP_POSITIONS / WARMUP_PASSES);
const WARMUP_TIMEOUT_PER_PASS_MS = Math.floor(WARMUP_TIMEOUT_MS / WARMUP_PASSES);
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
  for (let pass = 0; pass < WARMUP_PASSES; pass += 1) {
    const passStartedAt = Date.now();
    let visited = 0;
    const currentGeometry = pass === 0 ? geometry : measureCaptureGeometry(root);
    const xPositions =
      root.kind === 'element'
        ? createPositions(currentGeometry.extentWidth, currentGeometry.rootViewport.width)
        : [0];
    const yPositions = createPositions(
      currentGeometry.extentHeight,
      currentGeometry.rootViewport.height
    );
    passPositions: for (const y of yPositions) {
      for (const x of xPositions) {
        if (
          visited >= MAX_WARMUP_POSITIONS_PER_PASS ||
          Date.now() - passStartedAt >= WARMUP_TIMEOUT_PER_PASS_MS
        ) {
          break passPositions;
        }
        throwIfAborted(signal);
        writePageScroll(root, x, y);
        heartbeat?.();
        visited += 1;
        await waitForCaptureStability(signal);
        throwIfAborted(signal);
        heartbeat?.();
      }
    }
  }
}
