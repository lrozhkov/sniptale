import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioImageElement,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../../features/scenario/project/v3';
import type {
  ScenarioElement,
  ScenarioElementBuildSettings,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  SCENARIO_VISUAL_BASELINE_CAPTURE_ASSET_ID,
  SCENARIO_VISUAL_BASELINE_IMPORTED_ASSET_ID,
} from './constants';

export function createCapturedImageElement(): ScenarioElement {
  return withElementId(
    'visual-capture-image',
    createScenarioImageElement({
      assetRef: {
        assetId: SCENARIO_VISUAL_BASELINE_CAPTURE_ASSET_ID,
        galleryAssetId: 'gallery-hatiqo-capture',
      },
      captureContext: {
        captureMetadata: {
          pointerRange: null,
          scroll: null,
          trigger: 'pointer-up',
        },
        cursorPoint: { x: 702, y: 424 },
        interactionPoint: { x: 702, y: 424 },
        page: {
          devicePixelRatio: 1,
          scrollX: 0,
          scrollY: 0,
          title: 'Hatiqo customer workspace',
          url: 'https://app.hatiqo.local/accounts',
          viewport: { height: 900, width: 1440, x: 0, y: 0 },
        },
        target: {
          ariaLabel: 'Open scenario editor',
          framePadding: null,
          iframeSelector: null,
          rect: { height: 46, width: 178, x: 612, y: 394 },
          role: 'button',
          selector: '[data-action="create-scenario"]',
          tagName: 'button',
          text: 'Create scenario',
          title: null,
        },
      },
      frame: { height: 520, width: 920, x: 118, y: 86 },
      fit: 'fill',
      name: 'Recorded Hatiqo-like app page',
    })
  );
}

export function createTargetHighlightElement(): ScenarioElement {
  return withElementId(
    'visual-target-highlight',
    createScenarioShapeElement({
      cornerRadius: 12,
      fillColor: 'rgba(255, 255, 255, 0.08)',
      frame: { height: 66, width: 232, x: 500, y: 303 },
      name: 'Target highlight',
      strokeColor: '#f97316',
      strokeWidth: 4,
    })
  );
}

export function createTargetArrowElement(): ScenarioElement {
  return withElementId(
    'visual-target-arrow',
    createScenarioArrowElement({
      end: { x: 525, y: 340 },
      frame: { height: 180, width: 280, x: 714, y: 230 },
      name: 'Click target arrow',
      start: { x: 948, y: 126 },
      strokeColor: '#c65f22',
      strokeWidth: 6,
    })
  );
}

export function createNoteCalloutElement(): ScenarioElement {
  return withElementId(
    'visual-note-callout',
    createScenarioCalloutElement({
      connector: {
        end: { x: 508, y: 337 },
        start: { x: 820, y: 190 },
      },
      frame: { height: 128, width: 330, x: 764, y: 118 },
      name: 'Speaker note callout',
      text: 'Click the scenario action while keeping the app context visible.',
    })
  );
}

export function createEmptyViewportImageElement(): ScenarioElement {
  return withElementId(
    'visual-empty-page-image',
    createScenarioImageElement({
      assetRef: { assetId: SCENARIO_VISUAL_BASELINE_CAPTURE_ASSET_ID, galleryAssetId: null },
      contentTransform: { scale: 1.3, x: -120, y: -70 },
      frame: { height: 470, width: 760, x: 260, y: 120 },
      fit: 'fill',
      name: 'Mostly empty app viewport',
    })
  );
}

export function createEmptyViewportCaptionElement(): ScenarioElement {
  return withElementId(
    'visual-empty-page-caption',
    createScenarioTextElement({
      frame: { height: 84, width: 430, x: 424, y: 606 },
      name: 'Empty page caption',
      style: { align: 'center', color: '#5b5146', fontSize: 28, fontWeight: 650 },
      text: 'Mostly empty viewport baseline',
    })
  );
}

export function createBuildTitleElement(): ScenarioElement {
  return withElementId(
    'visual-build-title',
    createScenarioTextElement({
      build: createBuildSettings(0, 0),
      frame: { height: 110, width: 760, x: 250, y: 160 },
      name: 'Build title',
      style: { align: 'left', color: '#2f2a24', fontSize: 52, fontWeight: 760 },
      text: 'Build elements reveal in order',
    })
  );
}

export function createBuildNoteElement(): ScenarioElement {
  return withElementId(
    'visual-build-note',
    createScenarioCalloutElement({
      build: createBuildSettings(1, 1),
      frame: { height: 136, width: 382, x: 260, y: 332 },
      name: 'Build note',
      text: 'First fragment: explain the target before showing the result.',
    })
  );
}

export function createBuildResultElement(): ScenarioElement {
  return withElementId(
    'visual-build-result',
    createScenarioShapeElement({
      build: createBuildSettings(2, 2),
      cornerRadius: 18,
      fillColor: 'rgba(33, 102, 172, 0.14)',
      frame: { height: 150, width: 354, x: 684, y: 330 },
      name: 'Build result panel',
      strokeColor: '#2f6f9f',
      strokeWidth: 2,
    })
  );
}

export function createBuildFinalLabelElement(): ScenarioElement {
  return withElementId(
    'visual-build-final-label',
    createScenarioTextElement({
      build: createBuildSettings(3, 3),
      frame: { height: 72, width: 320, x: 706, y: 372 },
      name: 'Build final label',
      style: { align: 'center', color: '#24445e', fontSize: 26, fontWeight: 700 },
      text: 'Final fragment',
    })
  );
}

export function createImportedImageElement(): ScenarioElement {
  return withElementId(
    'visual-imported-image',
    createScenarioImageElement({
      assetRef: {
        assetId: SCENARIO_VISUAL_BASELINE_IMPORTED_ASSET_ID,
        galleryAssetId: 'gallery-imported-image',
      },
      frame: { height: 560, width: 996, x: 142, y: 80 },
      fit: 'fill',
      name: 'Imported image slide',
    })
  );
}

export function createStepTitle(args: { step: number; title: string }): ScenarioElement {
  return withElementId(
    `visual-step-${args.step}-title`,
    createScenarioTextElement({
      frame: { height: 96, width: 780, x: 268, y: 172 },
      name: `Step ${args.step} title`,
      style: { align: 'left', color: '#2f2a24', fontSize: 54, fontWeight: 760 },
      text: args.title,
    })
  );
}

export function createStepCallout(args: { body: string; step: number }): ScenarioElement {
  return withElementId(
    `visual-step-${args.step}-callout`,
    createScenarioCalloutElement({
      frame: { height: 150, width: 550, x: 276, y: 340 },
      name: `Step ${args.step} callout`,
      text: args.body,
    })
  );
}

export function createStepBadge(step: number): ScenarioElement {
  return withElementId(
    `visual-step-${step}-badge`,
    createScenarioShapeElement({
      cornerRadius: 28,
      fillColor: '#2f2a24',
      frame: { height: 112, width: 112, x: 112, y: 152 },
      name: `Step ${step} badge`,
      shape: 'ellipse',
      strokeColor: '#2f2a24',
      strokeWidth: 0,
    })
  );
}

function withElementId<TElement extends ScenarioElement>(id: string, element: TElement): TElement {
  return { ...element, id };
}

function createBuildSettings(order: number, showAtClick: number): ScenarioElementBuildSettings {
  return {
    hideAtClick: null,
    order,
    showAtClick,
  };
}
