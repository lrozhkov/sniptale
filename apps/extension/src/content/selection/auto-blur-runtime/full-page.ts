import {
  measurePageScrollGeometry,
  readPageScroll,
  resolvePageScrollRoot,
  writePageScroll,
} from '../../platform/page-scroll';
import { createAutoBlurScanAbortError, throwIfAutoBlurScanAborted } from './cancellation';

const VIEWPORT_OVERLAP_CSS_PX = 64;
const MAX_AUTO_BLUR_VIEWPORTS = 256;

function getScrollPositionPlan(extent: number, viewport: number, preferred: number) {
  if (!Number.isFinite(extent) || !Number.isFinite(viewport) || extent <= 0 || viewport <= 0) {
    throw new Error('unsupported-layout: invalid auto-blur page geometry');
  }
  if (extent <= viewport) return { count: 1, lastPosition: 0, preferredPosition: 0, step: 1 };
  const lastPosition = extent - viewport;
  const step = Math.max(1, viewport - VIEWPORT_OVERLAP_CSS_PX);
  const preferredPosition = Math.min(Math.max(0, preferred), lastPosition);
  const baseCount = Math.ceil(lastPosition / step) + 1;
  const preferredIsPlanned =
    preferredPosition === 0 ||
    preferredPosition === lastPosition ||
    Number.isInteger(preferredPosition / step);
  return {
    count: baseCount + (preferredIsPlanned ? 0 : 1),
    lastPosition,
    preferredPosition,
    step,
  };
}

function createScrollPositions(plan: ReturnType<typeof getScrollPositionPlan>): number[] {
  const positions: number[] = [];
  for (let offset = 0; ; offset += plan.step) {
    positions.push(Math.min(offset, plan.lastPosition));
    if (positions.at(-1) === plan.lastPosition) break;
  }
  return [
    plan.preferredPosition,
    ...positions.filter((position) => position !== plan.preferredPosition),
  ];
}

function assertTraversalBudget(xCount: number, yCount: number): void {
  if (
    !Number.isSafeInteger(xCount) ||
    !Number.isSafeInteger(yCount) ||
    xCount > MAX_AUTO_BLUR_VIEWPORTS ||
    yCount > Math.floor(MAX_AUTO_BLUR_VIEWPORTS / xCount)
  ) {
    throw new Error('unsupported-layout: auto-blur page exceeds safe viewport budget');
  }
}

function waitForViewportRender(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let firstFrame = 0;
    let secondFrame = 0;
    const handleAbort = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      reject(createAutoBlurScanAbortError());
    };
    const complete = () => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(complete);
    });
  });
}

export async function visitAutoBlurPageViewports(
  visit: (scrollDelta: { x: number; y: number }) => void,
  signal?: AbortSignal
): Promise<void> {
  const root = resolvePageScrollRoot();
  const originalScroll = readPageScroll(root);

  try {
    throwIfAutoBlurScanAborted(signal);
    const geometry = measurePageScrollGeometry(root);
    const xPlan = getScrollPositionPlan(
      geometry.extentWidth,
      geometry.viewportWidth,
      originalScroll.x
    );
    const yPlan = getScrollPositionPlan(
      geometry.extentHeight,
      geometry.viewportHeight,
      originalScroll.y
    );
    assertTraversalBudget(xPlan.count, yPlan.count);
    const xPositions = createScrollPositions(xPlan);
    const yPositions = createScrollPositions(yPlan);
    for (const y of yPositions) {
      for (const x of xPositions) {
        throwIfAutoBlurScanAborted(signal);
        writePageScroll(root, x, y);
        await waitForViewportRender(signal);
        throwIfAutoBlurScanAborted(signal);
        const currentScroll = readPageScroll(root);
        visit({
          x: currentScroll.x - originalScroll.x,
          y: currentScroll.y - originalScroll.y,
        });
      }
    }
  } finally {
    writePageScroll(root, originalScroll.x, originalScroll.y);
    await waitForViewportRender();
  }
}
