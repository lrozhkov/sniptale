import { useMemo, useRef } from 'react';
import { buildFrameManagerResult } from '../manager/public-result';
import type { FrameManagerPublicResultParams } from '../manager/public-result.types';

export function useFrameManagerPublicResult(params: FrameManagerPublicResultParams) {
  const stableParams = useStablePublicResultParams(params);
  return useMemo(() => buildFrameManagerResult(stableParams), [stableParams]);
}

function useStablePublicResultParams(params: FrameManagerPublicResultParams) {
  const paramsRef = useRef(params);

  if (!arePublicResultParamsEqual(paramsRef.current, params)) {
    paramsRef.current = params;
  }

  return paramsRef.current;
}

function arePublicResultParamsEqual(
  prev: FrameManagerPublicResultParams,
  next: FrameManagerPublicResultParams
) {
  return (
    prev.addAutoBlurFrames === next.addAutoBlurFrames &&
    prev.addFrame === next.addFrame &&
    prev.clearAutoBlurFrames === next.clearAutoBlurFrames &&
    prev.clearFrames === next.clearFrames &&
    prev.frames === next.frames &&
    prev.getGlobalStepBadgeSettings === next.getGlobalStepBadgeSettings &&
    prev.hasFrameForElement === next.hasFrameForElement &&
    prev.recalculateStepBadges === next.recalculateStepBadges &&
    prev.removeFrame === next.removeFrame &&
    prev.syncFocusOpacity === next.syncFocusOpacity &&
    prev.syncAutoBlurFrames === next.syncAutoBlurFrames &&
    prev.updateFrame === next.updateFrame &&
    prev.updateFrameEffect === next.updateFrameEffect &&
    prev.updateFrameStepBadge === next.updateFrameStepBadge &&
    prev.updateGlobalStepBadgeSettings === next.updateGlobalStepBadgeSettings
  );
}
