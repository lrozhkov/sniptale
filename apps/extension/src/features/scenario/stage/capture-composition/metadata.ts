import type { ScenarioCaptureMetadata } from '@sniptale/runtime-contracts/scenario/types/v3';

export function createDefaultCaptureMetadata(): ScenarioCaptureMetadata {
  return {
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up',
  };
}
