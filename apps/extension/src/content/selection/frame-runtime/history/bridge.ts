import type { FrameState } from '../../../../features/highlighter/contracts';
import type { FrameManagerRefs, FrameSetter, FrameStateSetter } from '../contracts';
import {
  captureFrameSessionSnapshot,
  hydrateFrameSessionSnapshot,
  type PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { useFrameUIStore } from '../state/frame-ui.store';
import { getFrameSessionBorderPreset, setFrameSessionBorderPreset } from '../session/border-preset';

export function applyHistorySnapshotToFrameManager(args: {
  refs: FrameManagerRefs;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
  snapshot: ReturnType<PagePreparationHistoryBridge['captureSnapshot']>;
}) {
  const frameSnapshot = args.snapshot.frameSession;
  const { frames, stepBadgeOrder } = hydrateFrameSessionSnapshot(frameSnapshot);
  const nextFrameStates = new Map<string, FrameState>(frames.map((frame) => [frame.id, 'idle']));

  args.refs.framesRef.current = frames;
  args.refs.prevFramesRef.current = frames;
  args.refs.frameStatesRef.current = nextFrameStates;
  args.refs.prevFrameStatesRef.current = nextFrameStates;
  args.refs.hostLayoutServiceRef.current.restoreFrames(frames);
  args.refs.stepBadgeOrderRef.current = stepBadgeOrder;
  args.refs.globalEffectModeRef.current = frameSnapshot.globalEffectMode;
  args.refs.globalStepBadgeSettingsRef.current = { ...frameSnapshot.globalStepBadgeSettings };
  args.refs.globalStepBadgeAutoModeRef.current = frameSnapshot.globalStepBadgeSettings.autoMode;
  setFrameSessionBorderPreset(frameSnapshot.sessionBorderPreset);
  args.refs.sessionSettingsRefs.blurSettings.current = { ...frameSnapshot.sessionBlurSettings };
  args.refs.sessionSettingsRefs.defaultsInitialized.current = true;
  args.refs.sessionSettingsRefs.focusSettings.current = { ...frameSnapshot.sessionFocusSettings };
  args.refs.sessionStepBadgeTemplateRef.current = frameSnapshot.sessionStepBadgeTemplate
    ? {
        ...frameSnapshot.sessionStepBadgeTemplate,
        offsetDirections: [...(frameSnapshot.sessionStepBadgeTemplate.offsetDirections ?? [])],
        ...(frameSnapshot.sessionStepBadgeTemplate.manualPlacement
          ? { manualPlacement: { ...frameSnapshot.sessionStepBadgeTemplate.manualPlacement } }
          : {}),
      }
    : null;
  args.refs.sessionCalloutStyleRef.current = frameSnapshot.sessionCalloutStyle
    ? { ...frameSnapshot.sessionCalloutStyle }
    : null;

  useFrameUIStore.getState().reset();
  args.setFrameStates(nextFrameStates);
  args.setFrames(frames);
}

export function createPagePreparationHistoryBridge(args: {
  refs: FrameManagerRefs;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
}): PagePreparationHistoryBridge {
  return {
    applySnapshot: (snapshot) => {
      applyHistorySnapshotToFrameManager({
        refs: args.refs,
        setFrames: args.setFrames,
        setFrameStates: args.setFrameStates,
        snapshot,
      });
      browserAnnotationSession.applySnapshot(snapshot.annotations);
    },
    captureSnapshot: () => ({
      annotations: browserAnnotationSession.captureSnapshot(),
      frameSession: captureFrameSessionSnapshot({
        frames: args.refs.framesRef.current,
        globalEffectMode: args.refs.globalEffectModeRef.current,
        globalStepBadgeSettings: args.refs.globalStepBadgeSettingsRef.current,
        sessionBorderPreset: getFrameSessionBorderPreset(),
        sessionBlurSettings: args.refs.sessionSettingsRefs.blurSettings.current,
        sessionCalloutStyle: args.refs.sessionCalloutStyleRef.current,
        sessionFocusSettings: args.refs.sessionSettingsRefs.focusSettings.current,
        sessionStepBadgeTemplate: args.refs.sessionStepBadgeTemplateRef.current,
        stepBadgeOrder: args.refs.stepBadgeOrderRef.current,
      }),
    }),
    onHistoryCleared: () => args.refs.hostLayoutServiceRef.current.retireHistoryBindings(),
    onHistoryReachabilityChanged: (frameIds) =>
      args.refs.hostLayoutServiceRef.current.retireHistoryBindings(frameIds),
  };
}
