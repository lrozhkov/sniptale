import { useEffect, useRef } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { PendingAutoStartCapture } from '../../app/content-mode/state/pending-auto-start';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { ScreenshotStartContext } from '../types';
import { waitForContentDocumentFocus } from '../../../platform/page-context/focus';

type ScreenshotType = 'visible' | 'full' | 'selection';

const logger = createLogger({ namespace: 'ContentScreenshotAutoStart' });
const AUTO_START_FOCUS_TIMEOUT_MS = 1000;

interface UseContentScreenshotAutoStartArgs {
  clearPendingAutoStartCapture: () => void;
  handleTakeScreenshot: (
    type: ScreenshotType,
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>;
  pendingAutoStartCapture: PendingAutoStartCapture | null;
  screenshotMode: boolean;
}

export function useContentScreenshotAutoStart(args: UseContentScreenshotAutoStartArgs): void {
  const {
    clearPendingAutoStartCapture,
    handleTakeScreenshot,
    pendingAutoStartCapture,
    screenshotMode,
  } = args;
  const { consumedRef, generationRef, isMountedRef, screenshotModeRef } =
    useAutoStartGenerationState(screenshotMode);

  useEffect(() => {
    if (pendingAutoStartCapture === null) {
      consumedRef.current = null;
      return;
    }

    if (
      !screenshotMode ||
      areSamePendingAutoStartCapture(consumedRef.current, pendingAutoStartCapture)
    ) {
      return;
    }

    consumedRef.current = pendingAutoStartCapture;
    const runGeneration = generationRef.current + 1;
    generationRef.current = runGeneration;
    clearPendingAutoStartCapture();

    void runQueuedAutoStartCapture({
      handleTakeScreenshot,
      isCurrent: () =>
        isMountedRef.current &&
        screenshotModeRef.current &&
        generationRef.current === runGeneration,
      pendingAutoStartCapture,
    }).catch((error) => {
      logger.error('Failed to start queued auto-start screenshot capture', error);
    });
  }, [
    clearPendingAutoStartCapture,
    consumedRef,
    generationRef,
    handleTakeScreenshot,
    isMountedRef,
    pendingAutoStartCapture,
    screenshotMode,
    screenshotModeRef,
  ]);
}

function useAutoStartGenerationState(screenshotMode: boolean) {
  const consumedRef = useRef<PendingAutoStartCapture | null>(null);
  const generationRef = useRef(0);
  const isMountedRef = useRef(true);
  const screenshotModeRef = useRef(screenshotMode);

  useEffect(() => {
    screenshotModeRef.current = screenshotMode;
    if (!screenshotMode) {
      generationRef.current += 1;
    }
  }, [generationRef, screenshotMode]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      generationRef.current += 1;
    },
    [generationRef, isMountedRef]
  );

  return { consumedRef, generationRef, isMountedRef, screenshotModeRef };
}

async function runQueuedAutoStartCapture({
  handleTakeScreenshot,
  isCurrent,
  pendingAutoStartCapture,
}: {
  handleTakeScreenshot: UseContentScreenshotAutoStartArgs['handleTakeScreenshot'];
  isCurrent: () => boolean;
  pendingAutoStartCapture: PendingAutoStartCapture;
}): Promise<void> {
  const focused = await waitForContentDocumentFocus({
    timeoutMs: AUTO_START_FOCUS_TIMEOUT_MS,
  });
  if (!focused) {
    logger.debug('Queued auto-start capture continued without focused document');
  }
  if (!isCurrent()) {
    logger.debug('Queued auto-start capture cancelled before start');
    return;
  }

  await handleTakeScreenshot(
    pendingAutoStartCapture.type,
    pendingAutoStartCapture.contentIntentSource,
    pendingAutoStartCapture.startContext
  );
}

function areSamePendingAutoStartCapture(
  previous: PendingAutoStartCapture | null,
  next: PendingAutoStartCapture
): boolean {
  if (!previous || previous.type !== next.type) {
    return false;
  }

  if (previous.startContext?.navigationLockBaseline !== next.startContext?.navigationLockBaseline) {
    return false;
  }

  if (!previous.contentIntentSource && !next.contentIntentSource) {
    return true;
  }

  return (
    previous.contentIntentSource?.kind === 'background-auto-start' &&
    next.contentIntentSource?.kind === 'background-auto-start' &&
    previous.contentIntentSource.grantToken === next.contentIntentSource.grantToken
  );
}
