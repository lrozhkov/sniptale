import { useCallback, useMemo, useRef } from 'react';
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
import { waitForViewerSurfaceCommit } from '../surface/controller';
import {
  PREPARATION_SURFACE_RESIZE,
  type ViewerPreparationCommand,
} from '../../../workflows/page-preparation';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';

type ViewerSurfaceTransactionRunner = (transaction: () => Promise<void>) => Promise<void>;

async function rollbackViewerPreparationCommand(args: {
  command: ViewerPreparationCommand;
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
  onCommand: (command: ViewerPreparationCommand) => void | Promise<void>;
  previous: AppliedViewportPresetPayload | null;
  previouslyEnabled: boolean;
}): Promise<void> {
  if (args.command.type === MessageType.ENABLE_SCREENSHOT_MODE) {
    await args.onCommand({ type: MessageType.DISABLE_SCREENSHOT_MODE });
  } else if (args.command.type === MessageType.DISABLE_SCREENSHOT_MODE && args.previouslyEnabled) {
    await args.onCommand({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      viewport: args.previous,
    });
  }
  const rollbackCommand = {
    type: PREPARATION_SURFACE_RESIZE,
    viewport: args.previous,
  } as const;
  await args.onCommand(rollbackCommand);
  await waitForViewerSurfaceCommit({
    command: rollbackCommand,
    iframe: args.iframe,
    manifest: args.manifest,
  });
}

function useViewerSurfaceTransaction(args: {
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
}) {
  const { iframe, manifest } = args;
  const committedViewportRef = useRef<AppliedViewportPresetPayload | null>(null);
  const preparationEnabledRef = useRef(false);
  const transactionTailRef = useRef<Promise<void>>(Promise.resolve());
  const runTransaction = useCallback<ViewerSurfaceTransactionRunner>((transaction) => {
    const result = transactionTailRef.current.catch(() => undefined).then(transaction);
    transactionTailRef.current = result.catch(() => undefined);
    return result;
  }, []);
  const connectPort = useCallback<PreparationHostPorts['connectPort']>(
    (onCommand, onPopupExportRequest) =>
      connectViewerPreparationPort(
        (command) =>
          runTransaction(async () => {
            const previous = committedViewportRef.current;
            const previouslyEnabled = preparationEnabledRef.current;
            try {
              await onCommand(command);
              await waitForViewerSurfaceCommit({ command, iframe, manifest });
              if ('viewport' in command) committedViewportRef.current = command.viewport ?? null;
              if (command.type === MessageType.ENABLE_SCREENSHOT_MODE) {
                preparationEnabledRef.current = true;
              } else if (command.type === MessageType.DISABLE_SCREENSHOT_MODE) {
                preparationEnabledRef.current = false;
              }
            } catch (error) {
              try {
                await rollbackViewerPreparationCommand({
                  command,
                  iframe,
                  manifest,
                  onCommand,
                  previous,
                  previouslyEnabled,
                });
                preparationEnabledRef.current = previouslyEnabled;
              } catch (rollbackError) {
                throw new AggregateError(
                  [error, rollbackError],
                  'Snapshot viewer rollback failed.',
                  { cause: rollbackError }
                );
              }
              throw error;
            }
          }),
        onPopupExportRequest
      ),
    [iframe, manifest, runTransaction]
  );
  return { committedViewportRef, connectPort, runTransaction };
}

export function ViewerPreparationRuntime(props: {
  iframe: HTMLIFrameElement | null;
  manifest: WebSnapshotManifest;
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
}) {
  const { iframe, manifest, onViewportChange } = props;
  const { connectPort } = useViewerSurfaceTransaction({
    iframe,
    manifest,
  });
  const handlePopupExportRequest = useViewerPopupExportHandler(iframe, manifest);
  const acceptsElement = useCallback(
    (element: HTMLElement) => Boolean(iframe && isElementInsideSnapshotIframe(element, iframe)),
    [iframe]
  );
  const ports = useMemo<PreparationHostPorts>(
    () => ({
      acceptsElement,
      connectPort,
      createCaptureAdapter: (frameSource) =>
        createViewerScreenshotCaptureAdapter({
          getFrames: frameSource.getFrames,
          iframe,
        }),
      createScenarioAutoClickCaptureTransport: createPreparationScenarioAutoClickCaptureTransport,
      createScenarioAutoClickListenerRegistry: () =>
        createViewerScenarioAutoClickListenerRegistry(iframe),
      createScenarioCaptureSourceAdapter: () =>
        createViewerScenarioCaptureSourceAdapter({
          iframe,
          manifest,
        }),
      onPopupExportRequest: handlePopupExportRequest,
      resolveAiPickSource: createViewerAiPickSourceResolver(iframe, manifest),
    }),
    [acceptsElement, connectPort, handlePopupExportRequest, iframe, manifest]
  );

  if (onViewportChange) {
    return <PreparationSurface ports={ports} onViewportChange={onViewportChange} />;
  }

  return <PreparationSurface ports={ports} />;
}
