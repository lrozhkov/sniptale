import {
  createDefaultScenarioElementAnimation,
  createDefaultScenarioElementBuild,
  createScenarioCalloutElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
} from '../../project/v3';
import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { CAPTURE_CANVAS_HEIGHT, CAPTURE_CANVAS_WIDTH, CAPTURE_STYLE_PRESETS } from './constants';
import type { ScenarioCaptureSlideInput } from './types';

const CLICK_MARKER_SIZE = 44;

export function createMainImageElement(
  input: ScenarioCaptureSlideInput,
  frame: ScenarioElementFrame
): ScenarioElement {
  return createScenarioImageElement({
    assetRef: input.assetRef,
    build: createDefaultScenarioElementBuild({ order: 0, showAtClick: 0 }),
    captureContext: {
      captureMetadata: input.captureMetadata,
      cursorPoint: input.cursorPoint,
      interactionPoint: input.interactionPoint,
      page: input.page,
      target: input.target,
    },
    frame,
    fit: 'fill',
    name: 'Captured screen',
    role: 'main-image',
    stylePresetId: 'main-screenshot',
  });
}

export function createTargetHighlightElement(
  frame: ScenarioElementFrame | null
): ScenarioElement | null {
  return frame
    ? createScenarioShapeElement({
        build: createDefaultScenarioElementBuild({ order: 1, showAtClick: 1 }),
        cornerRadius: 12,
        fillColor: CAPTURE_STYLE_PRESETS.highlight.fillColor,
        frame,
        name: 'Target highlight',
        role: 'target-highlight',
        stylePresetId: 'target-highlight',
        strokeColor: CAPTURE_STYLE_PRESETS.highlight.strokeColor,
        strokeWidth: 4,
      })
    : null;
}

export function createClickMarkerElement(
  frame: ScenarioElementFrame | null
): ScenarioElement | null {
  return frame
    ? createScenarioShapeElement({
        animation: createDefaultScenarioElementAnimation({ preset: 'scale' }),
        build: createDefaultScenarioElementBuild({ order: 3, showAtClick: 1 }),
        fillColor: CAPTURE_STYLE_PRESETS.click.fillColor,
        frame,
        name: 'Click marker',
        role: 'click-marker',
        shape: 'ellipse',
        stylePresetId: 'click-marker',
        strokeColor: CAPTURE_STYLE_PRESETS.click.strokeColor,
        strokeWidth: 3,
      })
    : null;
}

export function createConnectorElement(args: {
  dash?: 'dashed' | 'dotted' | 'solid';
  end: ScenarioPoint | null;
  order: number;
  start: ScenarioPoint | null;
}): ScenarioElement | null {
  return args.start && args.end
    ? createScenarioLineElement({
        build: createDefaultScenarioElementBuild({ order: args.order, showAtClick: 1 }),
        dash: args.dash ?? 'solid',
        frame: { height: CAPTURE_CANVAS_HEIGHT, width: CAPTURE_CANVAS_WIDTH, x: 0, y: 0 },
        name: 'Connector',
        role: 'connector',
        stylePresetId: 'callout-connector',
        start: args.start,
        end: args.end,
        strokeColor: CAPTURE_STYLE_PRESETS.connector.strokeColor,
        strokeWidth: CAPTURE_STYLE_PRESETS.connector.strokeWidth,
      })
    : null;
}

export function createStepNoteElement(args: {
  frame: ScenarioElementFrame | null;
  text: string | null;
}): ScenarioElement | null {
  return args.frame && args.text
    ? createScenarioCalloutElement({
        build: createDefaultScenarioElementBuild({ order: 4, showAtClick: 1 }),
        frame: args.frame,
        name: 'Step note',
        panel: CAPTURE_STYLE_PRESETS.callout,
        role: 'step-note',
        stylePresetId: 'primary-callout',
        text: args.text,
      })
    : null;
}

export function getClickMarkerSize(): number {
  return CLICK_MARKER_SIZE;
}
