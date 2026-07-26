import type { FrameState } from '../../../../features/highlighter/contracts';
import type { FrameManagerRefs, FrameSetter, FrameStateSetter } from '../contracts';
import {
  captureFrameSessionSnapshot,
  hydrateFrameSessionSnapshot,
  type PagePreparationHistoryBridge,
} from '../../../parser/page-preparation/history';
import { useFrameUIStore } from '../state/frame-ui.store';
import { getFrameSessionBorderPreset, setFrameSessionBorderPreset } from '../session/border-preset';

export function applyHistorySnapshotToFrameManager(args: {
  refs: FrameManagerRefs;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
  snapshot: ReturnType<PagePreparationHistoryBridge['captureSnapshot']>;
}) {
  const { frames, linkedElements, stepBadgeOrder } = hydrateFrameSessionSnapshot(args.snapshot);
  const nextFrameStates = new Map<string, FrameState>(frames.map((frame) => [frame.id, 'idle']));

  args.refs.framesRef.current = frames;
  args.refs.prevFramesRef.current = frames;
  args.refs.frameStatesRef.current = nextFrameStates;
  args.refs.prevFrameStatesRef.current = nextFrameStates;
  args.refs.linkedElementsRef.current = linkedElements;
  args.refs.stepBadgeOrderRef.current = stepBadgeOrder;
  args.refs.globalEffectModeRef.current = args.snapshot.globalEffectMode;
  args.refs.globalStepBadgeSettingsRef.current = { ...args.snapshot.globalStepBadgeSettings };
  args.refs.globalStepBadgeAutoModeRef.current = args.snapshot.globalStepBadgeSettings.autoMode;
  setFrameSessionBorderPreset(args.snapshot.sessionBorderPreset);
  args.refs.sessionSettingsRefs.blurSettings.current = { ...args.snapshot.sessionBlurSettings };
  args.refs.sessionSettingsRefs.defaultsInitialized.current = true;
  args.refs.sessionSettingsRefs.focusSettings.current = { ...args.snapshot.sessionFocusSettings };
  args.refs.sessionStepBadgeTemplateRef.current = args.snapshot.sessionStepBadgeTemplate
    ? {
        ...args.snapshot.sessionStepBadgeTemplate,
        offsetDirections: [...(args.snapshot.sessionStepBadgeTemplate.offsetDirections ?? [])],
        ...(args.snapshot.sessionStepBadgeTemplate.manualPlacement
          ? { manualPlacement: { ...args.snapshot.sessionStepBadgeTemplate.manualPlacement } }
          : {}),
      }
    : null;
  args.refs.sessionCalloutStyleRef.current = args.snapshot.sessionCalloutStyle
    ? { ...args.snapshot.sessionCalloutStyle }
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
    },
    captureSnapshot: () =>
      captureFrameSessionSnapshot({
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
  };
}
