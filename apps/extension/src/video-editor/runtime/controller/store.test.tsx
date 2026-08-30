// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useVideoEditorStore } from '../../state/store';
import {
  getCurrentVideoEditorCurrentTime,
  getCurrentVideoEditorExportStateSnapshot,
  getCurrentVideoEditorSelectedClipId,
  useVideoEditorAnnotationEditingPort,
  useVideoEditorClipSelectionPort,
  useVideoEditorDiagnosticsTelemetryPort,
  useVideoEditorEffectEditingPort,
  useVideoEditorExportPort,
  useVideoEditorHistoryPort,
  useVideoEditorPlaybackPort,
  useVideoEditorProjectLifecyclePort,
  useVideoEditorRuntimeSessionPort,
  useVideoEditorTimelineEditingPort,
} from './store';

const expectedKeys = {
  annotation: [
    'addAnnotationOverlay',
    'addShapeOverlay',
    'addSubtitleOverlay',
    'addTextOverlay',
    'convertTextClipToAnnotation',
    'updateAnnotationClipContent',
    'updateAnnotationClipStyle',
    'updateAnnotationClipTemplate',
    'updateShapeClipStyle',
    'updateSubtitleTrackStyle',
    'updateTextClipContent',
    'updateTextClipStyle',
  ],
  diagnostics: [
    'diagnosticsOpen',
    'recordingTelemetry',
    'setDiagnosticsOpen',
    'setRecordingTelemetry',
    'telemetryLaneVisible',
    'toggleTelemetryLaneVisibility',
  ],
  effects: [
    'applyEffectDocument',
    'deleteEffectInstance',
    'duplicateEffectInstance',
    'moveEffectInstance',
    'updateEffectInstance',
  ],
  export: [
    'cancelExport',
    'closeExportDialog',
    'completeExport',
    'exportState',
    'failExport',
    'failExportCancellation',
    'openExportDialog',
    'startExport',
    'updateExportSettings',
    'updateExportStatus',
  ],
  history: [
    'beginProjectHistoryTransaction',
    'endProjectHistoryTransaction',
    'isProjectHistoryTransactionCurrent',
    'projectHistoryStatus',
    'projectHistoryTransactionActive',
    'redoProject',
    'undoProject',
  ],
  lifecycle: [
    'error',
    'isReady',
    'project',
    'recordingId',
    'renameProject',
    'saveState',
    'setError',
    'setProject',
    'setReady',
    'setSaveState',
    'syncProjectRevision',
  ],
  playback: ['currentTime', 'isPlaying', 'setCurrentTime', 'setPlaying', 'togglePlaying'],
  runtime: [
    'clearPlacementMode',
    'placementMode',
    'startActionPointPlacement',
    'startMotionAreaPlacement',
    'startMotionFocusPlacement',
    'startMotionPathStopAreaPlacement',
    'startMotionPathStopPointPlacement',
    'startObjectTrackAnchorPlacement',
  ],
  selection: [
    'selectActionSegment',
    'selectClip',
    'selectCursorSegment',
    'selectMotionRegion',
    'selectObjectTrack',
    'selectScene',
    'selectTrack',
    'selectTransition',
    'selectedClipId',
    'selectedTrackId',
    'selection',
  ],
  timeline: [
    'addAssetClip',
    'addTrack',
    'addTrackLogicalLane',
    'addVideoBlock',
    'applyMediaClipVisualsToTrack',
    'clearCursorSampleSkinOverride',
    'clearUtilityLane',
    'closeTrackGap',
    'deleteActionEvent',
    'deleteClip',
    'deleteCursorSample',
    'deleteMotionRegion',
    'deleteObjectTrack',
    'deleteTrack',
    'detachClipGroup',
    'duplicateClip',
    'insertCursorSample',
    'moveClip',
    'moveTrack',
    'pixelsPerSecond',
    'renameTrack',
    'setPixelsPerSecond',
    'splitClipAt',
    'toggleTrackLock',
    'toggleTrackVisibility',
    'toggleUtilityLaneLock',
    'toggleUtilityLaneVisibility',
    'trimClipEnd',
    'trimClipStart',
    'updateActionEventDetails',
    'updateClipAudioEnvelope',
    'updateClipFades',
    'updateClipMuted',
    'updateClipPlaybackRate',
    'updateClipTransform',
    'updateClipTransitions',
    'updateClipVolume',
    'updateCursorSampleInterpolation',
    'updateCursorSampleSkinOverride',
    'updateCursorSampleVisibility',
    'updateMediaClipFitMode',
    'updateMediaClipFitScalePercent',
    'updateMediaClipShadowIntensity',
    'updateMediaClipShadowMode',
    'updateMotionRegion',
    'updateProject',
    'updateTransitionDuration',
    'updateTransitionEasing',
    'updateTransitionTemplate',
    'upsertAsset',
    'upsertObjectTrack',
    'upsertObjectTrackCorrectionAnchor',
  ],
} satisfies Record<string, string[]>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('projects every adapter key into exactly one capability', () => {
  let keys: Record<string, string[]> = {};
  function Probe() {
    keys = {
      annotation: Object.keys(useVideoEditorAnnotationEditingPort((port) => port)),
      diagnostics: Object.keys(useVideoEditorDiagnosticsTelemetryPort((port) => port)),
      effects: Object.keys(useVideoEditorEffectEditingPort((port) => port)),
      export: Object.keys(useVideoEditorExportPort((port) => port)),
      history: Object.keys(useVideoEditorHistoryPort((port) => port)),
      lifecycle: Object.keys(useVideoEditorProjectLifecyclePort((port) => port)),
      playback: Object.keys(useVideoEditorPlaybackPort((port) => port)),
      runtime: Object.keys(useVideoEditorRuntimeSessionPort((port) => port)),
      selection: Object.keys(useVideoEditorClipSelectionPort((port) => port)),
      timeline: Object.keys(useVideoEditorTimelineEditingPort((port) => port)),
    };
    return null;
  }

  act(() => root.render(<Probe />));

  for (const [capability, capabilityKeys] of Object.entries(expectedKeys)) {
    expect(keys[capability]?.toSorted()).toEqual(capabilityKeys.toSorted());
  }
  const allKeys = Object.values(keys).flat();
  expect(new Set(allKeys).size).toBe(allKeys.length);
  expect(allKeys).not.toContain('projectHistory');
});

it('keeps leaf projection identity and render isolation across unrelated updates', () => {
  const playbackSelections: object[] = [];
  const lifecycleSelections: object[] = [];
  const diagnosticsSelections: object[] = [];
  const telemetrySelections: object[] = [];
  const timelineSelections: object[] = [];

  function PlaybackProbe() {
    playbackSelections.push(useVideoEditorPlaybackPort(({ currentTime }) => ({ currentTime })));
    return null;
  }
  function LifecycleProbe() {
    lifecycleSelections.push(useVideoEditorProjectLifecyclePort(({ isReady }) => ({ isReady })));
    return null;
  }
  function DiagnosticsProbe() {
    diagnosticsSelections.push(
      useVideoEditorDiagnosticsTelemetryPort(({ diagnosticsOpen }) => ({ diagnosticsOpen }))
    );
    return null;
  }
  function TelemetryProbe() {
    telemetrySelections.push(
      useVideoEditorDiagnosticsTelemetryPort(({ telemetryLaneVisible }) => ({
        telemetryLaneVisible,
      }))
    );
    return null;
  }
  function TimelineProbe() {
    timelineSelections.push(
      useVideoEditorTimelineEditingPort(({ pixelsPerSecond }) => ({ pixelsPerSecond }))
    );
    return null;
  }

  act(() =>
    root.render(
      <>
        <PlaybackProbe />
        <LifecycleProbe />
        <DiagnosticsProbe />
        <TelemetryProbe />
        <TimelineProbe />
      </>
    )
  );
  const initialPlayback = playbackSelections[0];
  act(() => useVideoEditorStore.getState().setDiagnosticsOpen(true));
  expect(playbackSelections).toHaveLength(1);
  expect(lifecycleSelections).toHaveLength(1);
  expect(diagnosticsSelections).toHaveLength(2);
  expect(telemetrySelections).toHaveLength(1);
  expect(timelineSelections).toHaveLength(1);
  expect(playbackSelections[0]).toBe(initialPlayback);

  act(() => useVideoEditorStore.setState({ telemetryLaneVisible: true }));
  expect(diagnosticsSelections).toHaveLength(2);
  expect(telemetrySelections).toHaveLength(2);
  expect(timelineSelections).toHaveLength(1);

  act(() => useVideoEditorStore.setState({ currentTime: 250 }));
  expect(playbackSelections).toHaveLength(2);
  expect(lifecycleSelections).toHaveLength(1);
  expect(diagnosticsSelections).toHaveLength(2);
  expect(timelineSelections).toHaveLength(1);
});

it('reads invocation-time command snapshots from the canonical store', () => {
  act(() => {
    useVideoEditorStore.setState({
      currentTime: 750,
      selection: { kind: 'clip', clipId: 'clip-latest' },
      exportState: { ...useVideoEditorStore.getState().exportState, jobId: 'job-latest' },
    });
  });

  expect(getCurrentVideoEditorCurrentTime()).toBe(750);
  expect(getCurrentVideoEditorSelectedClipId()).toBe('clip-latest');
  expect(getCurrentVideoEditorExportStateSnapshot().jobId).toBe('job-latest');
});

function useAssertSelectorsRequireAProjection() {
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorPlaybackPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorTimelineEditingPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorClipSelectionPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorEffectEditingPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorAnnotationEditingPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorHistoryPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorExportPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorProjectLifecyclePort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorRuntimeSessionPort();
  // @ts-expect-error Capability hooks intentionally have no full-port overload.
  useVideoEditorDiagnosticsTelemetryPort();
}

void useAssertSelectorsRequireAProjection;
