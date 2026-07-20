import { useCallback, useMemo } from 'react';
import {
  PreparationSurface,
  createPreparationScenarioAutoClickCaptureTransport,
  type PreparationHostPorts,
} from '../../../content/public/preparation-surface';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createViewerScreenshotCaptureAdapter } from '../capture/adapter';
import { connectViewerPreparationPort } from '../port';
import { useViewerPopupExportHandler } from '../export';
import { createViewerAiPickSourceResolver } from './source';
import { isElementInsideSnapshotIframe } from './targets';
import { createViewerScenarioCaptureSourceAdapter } from '../scenario/descriptors';
import { createViewerScenarioAutoClickListenerRegistry } from '../scenario/listeners';

export function ViewerPreparationRuntime(props: {
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
}) {
  const handlePopupExportRequest = useViewerPopupExportHandler(props.iframe, props.manifest);
  const acceptsElement = useCallback(
    (element: HTMLElement) =>
      Boolean(props.iframe && isElementInsideSnapshotIframe(element, props.iframe)),
    [props.iframe]
  );
  const ports = useMemo<PreparationHostPorts>(
    () => ({
      acceptsElement,
      connectPort: connectViewerPreparationPort,
      createCaptureAdapter: (frameSource) =>
        createViewerScreenshotCaptureAdapter({
          getFrames: frameSource.getFrames,
          iframe: props.iframe,
        }),
      createScenarioAutoClickCaptureTransport: createPreparationScenarioAutoClickCaptureTransport,
      createScenarioAutoClickListenerRegistry: () =>
        createViewerScenarioAutoClickListenerRegistry(props.iframe),
      createScenarioCaptureSourceAdapter: () =>
        createViewerScenarioCaptureSourceAdapter({
          iframe: props.iframe,
          manifest: props.manifest,
        }),
      onPopupExportRequest: handlePopupExportRequest,
      resolveAiPickSource: createViewerAiPickSourceResolver(props.iframe, props.manifest),
    }),
    [acceptsElement, handlePopupExportRequest, props.iframe, props.manifest]
  );

  if (props.onViewportChange) {
    return <PreparationSurface ports={ports} onViewportChange={props.onViewportChange} />;
  }

  return <PreparationSurface ports={ports} />;
}
