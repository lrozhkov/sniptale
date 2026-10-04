import { Suspense } from 'react';
import { ContentDialogStack } from './dialogs';
import { DesignReviewSurface, useDesignReviewController } from '../design-review/view';
import { LazyContentScenarioRecorderSidebar } from './sidebar-lazy';
import { ContentToolbarShell } from './toolbar';
import { isScenarioByClickBlocked } from './scenario';
import type { ContentAppLayoutProps } from './types';
import { DrawingSurface } from '../../drawing/surface';
import { VideoRecordingSpotlight } from '../video-recording/spotlight/view';
import { EmbeddedRecordingCamera } from '../video-recording/camera/view';

function ContentScenarioRecorderSidebarSlot(props: {
  isCompletelyHidden: boolean;
  isToolbarVisible: boolean;
  byClickDisabled: boolean;
  handleTakeScreenshot: ContentAppLayoutProps['toolbar']['handleTakeScreenshot'];
  captureSuspended: boolean;
  modeController: ContentAppLayoutProps['toolbar']['modeController'];
  scenario: ContentAppLayoutProps['scenario'];
  setPinToTab: ContentAppLayoutProps['toolbar']['setPinToTab'];
  keepPinnedForAutoBlur: boolean;
}) {
  if (props.scenario.state.captureAction !== 'scenario' || !props.scenario.state.scenarioEnabled) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyContentScenarioRecorderSidebar
        isCompletelyHidden={props.isCompletelyHidden}
        isToolbarVisible={props.isToolbarVisible}
        byClickDisabled={props.byClickDisabled}
        handleTakeScreenshot={props.handleTakeScreenshot}
        captureSuspended={props.captureSuspended}
        modeController={props.modeController}
        scenario={props.scenario}
        setPinToTab={props.setPinToTab}
        keepPinnedForAutoBlur={props.keepPinnedForAutoBlur}
      />
    </Suspense>
  );
}

function VideoRecordingSurfaceSlot(props: {
  chromeHidden: boolean;
  toolbar: ContentAppLayoutProps['toolbar'];
}) {
  const recording = props.toolbar.videoRecording;
  const videoMode = props.toolbar.modes.videoRecordingMode;
  return (
    <>
      {videoMode && recording ? (
        <DrawingSurface
          active={recording.state.interaction === 'drawing'}
          chromeHidden={props.chromeHidden}
          controller={recording.drawingOwner.controller}
          escapeImmediately
          showSelectionChrome={false}
          onExit={() => recording.onInteractionChange('navigation')}
          visualEffects={{
            getOpacity: recording.drawingOwner.getVisualOpacity,
            getRevision: recording.drawingOwner.getVisualRevision,
            subscribe: recording.drawingOwner.subscribeVisualChanges,
          }}
        />
      ) : null}
      <VideoRecordingSpotlight
        cursorHaloEnabled={Boolean(
          videoMode &&
          recording?.state.interaction === 'navigation' &&
          recording.state.spotlightEnabled
        )}
        cursorDimmingEnabled={Boolean(
          videoMode &&
          recording?.state.interaction === 'navigation' &&
          recording.state.spotlightDimmingEnabled
        )}
        clickAnimationEnabled={Boolean(
          videoMode &&
          recording?.state.interaction === 'navigation' &&
          recording.state.spotlightClickAnimationEnabled
        )}
      />
      <EmbeddedRecordingCamera
        enabled={Boolean(
          videoMode &&
          recording?.state.surfaceSessionId &&
          recording.state.cameraEnabled &&
          !recording.state.cameraPreviewSuppressed &&
          recording.state.webcamPresentation.mode === 'embedded'
        )}
        {...(recording ? { peerGeneration: recording.state.peerGeneration } : {})}
        {...(recording ? { geometry: recording.state.webcamPresentation } : {})}
        interactive={recording?.state.interaction === 'navigation'}
        {...(recording
          ? {
              onOffer: recording.onCameraOffer,
              onPeerClose: recording.onCameraPeerClose,
              onGeometryChange: recording.onCameraGeometryChange,
            }
          : {})}
      />
    </>
  );
}

export function ContentAppLayout(props: ContentAppLayoutProps) {
  const isCaptureUiHidden = props.toolbar.isCompletelyHidden;
  const designReview = useDesignReviewController({
    enabled: props.toolbar.modes.designReviewMode,
  });

  return (
    <>
      <VideoRecordingSurfaceSlot chromeHidden={isCaptureUiHidden} toolbar={props.toolbar} />
      {props.toolbar.modes.screenshotMode && props.toolbar.drawingController ? (
        <DrawingSurface
          active={props.toolbar.modes.drawingMode === true}
          chromeHidden={isCaptureUiHidden}
          controller={props.toolbar.drawingController}
          {...(props.toolbar.modeController.handleToggleDrawingMode === undefined
            ? {}
            : { onExit: () => props.toolbar.modeController.handleToggleDrawingMode?.(false) })}
        />
      ) : null}
      <ContentToolbarShell
        designReview={designReview}
        scenario={props.scenario}
        toolbar={props.toolbar}
      />
      {props.toolbar.modes.screenshotMode && props.toolbar.modes.drawingMode !== true ? (
        <DesignReviewSurface controller={designReview} showChrome={!isCaptureUiHidden} />
      ) : null}
      <ContentScenarioRecorderSidebarSlot
        isCompletelyHidden={props.toolbar.isCompletelyHidden}
        isToolbarVisible={props.toolbar.isToolbarVisible}
        byClickDisabled={isScenarioByClickBlocked(props.toolbar.modes)}
        handleTakeScreenshot={props.toolbar.handleTakeScreenshot}
        captureSuspended={props.dialogs.countdown !== null}
        modeController={props.toolbar.modeController}
        scenario={props.scenario}
        setPinToTab={props.toolbar.setPinToTab}
        keepPinnedForAutoBlur={
          props.toolbar.autoBlurController.autoApplyEnabled &&
          props.toolbar.autoBlurController.autoApplyAllowed
        }
      />
      {isCaptureUiHidden ? null : <ContentDialogStack dialogs={props.dialogs} />}
    </>
  );
}
