import * as React from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { PreviewEffectRuntimeFeedback, PreviewEffectRuntimeSource } from '../types';

const logger = createLogger({ namespace: 'VideoEditorPreviewEffectRuntime' });

export function usePreviewEffectRuntimeFeedback(): PreviewEffectRuntimeFeedback {
  const [failedSources, setFailedSources] = React.useState<ReadonlySet<PreviewEffectRuntimeSource>>(
    () => new Set()
  );
  const failedSourcesRef = React.useRef<ReadonlySet<PreviewEffectRuntimeSource>>(failedSources);
  const [retryVersion, setRetryVersion] = React.useState(0);
  const onFailure = React.useCallback((source: PreviewEffectRuntimeSource, error: unknown) => {
    if (failedSourcesRef.current.has(source)) return;
    failedSourcesRef.current = addFailedSource(failedSourcesRef.current, source);
    logger.error(`EffectV1 preview ${source} failed`, error);
    setFailedSources(failedSourcesRef.current);
  }, []);
  const onRecovery = React.useCallback((source: PreviewEffectRuntimeSource) => {
    if (!failedSourcesRef.current.has(source)) return;
    failedSourcesRef.current = removeFailedSource(failedSourcesRef.current, source);
    setFailedSources(failedSourcesRef.current);
  }, []);
  const onRetry = React.useCallback(() => {
    failedSourcesRef.current = new Set();
    setFailedSources(failedSourcesRef.current);
    setRetryVersion((current) => current + 1);
  }, []);
  return React.useMemo(
    () => ({
      failed: failedSources.size > 0,
      onFailure,
      onRecovery,
      onRetry,
      retryVersion,
    }),
    [failedSources.size, onFailure, onRecovery, onRetry, retryVersion]
  );
}

function addFailedSource(
  current: ReadonlySet<PreviewEffectRuntimeSource>,
  source: PreviewEffectRuntimeSource
): ReadonlySet<PreviewEffectRuntimeSource> {
  if (current.has(source)) return current;
  return new Set([...current, source]);
}

function removeFailedSource(
  current: ReadonlySet<PreviewEffectRuntimeSource>,
  source: PreviewEffectRuntimeSource
): ReadonlySet<PreviewEffectRuntimeSource> {
  if (!current.has(source)) return current;
  const next = new Set(current);
  next.delete(source);
  return next;
}
