import type {
  ScenarioCaptureMetadata,
  ScenarioImageTransform,
  ScenarioPageDescriptor,
  ScenarioViewportTransform,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
  createDefaultScenarioViewportTransform,
} from '../stage/layout';

const DEFAULT_IMAGE_TRANSFORM: ScenarioImageTransform = {
  scale: 1,
  x: 0,
  y: 0,
};

const DEFAULT_CAPTURE_METADATA: ScenarioCaptureMetadata = {
  pointerRange: null,
  scroll: null,
  trigger: 'pointer-up',
};

export function createDefaultScenarioPageDescriptor(): ScenarioPageDescriptor {
  return {
    title: null,
    url: null,
    viewport: {
      x: 0,
      y: 0,
      width: SCENARIO_STAGE_WIDTH,
      height: SCENARIO_STAGE_HEIGHT,
    },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  };
}

/**
 * Creates the default fixed-size viewport window used by the scenario editor.
 */
export function createDefaultScenarioViewport(): ScenarioViewportTransform {
  return createDefaultScenarioViewportTransform();
}

export function getDefaultScenarioImageTransform(): ScenarioImageTransform {
  return DEFAULT_IMAGE_TRANSFORM;
}

export function getDefaultScenarioCaptureMetadata(): ScenarioCaptureMetadata {
  return DEFAULT_CAPTURE_METADATA;
}
