export { hasBlurFrameForRect, isFrameOverlappingAutoBlurRect } from './geometry';
export {
  countSelectedAutoBlurMatches,
  isAutoBlurMatchSelected,
  selectAutoBlurMatches,
} from './match-selection';
export { scanAutoBlurTargets } from './scan';
export { collectVisibleAutoBlurTextSources } from './visible-text';
export { ruleAutoBlurDetector } from './detectors/rule-detector';
export type {
  AutoBlurApplyInput,
  AutoBlurApplyResult,
  AutoBlurApplyTarget,
  AutoBlurClearInput,
  AutoBlurClearResult,
  AutoBlurMatch,
  AutoBlurScanInput,
  AutoBlurScanResult,
  AutoBlurSyncInput,
  AutoBlurSyncResult,
  AutoBlurTextRect,
  AutoBlurTextSource,
} from './types';
