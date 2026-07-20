import { createScenarioSlide } from '../../../features/scenario/project/v3';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SCENARIO_VISUAL_BASELINE_SLIDE_IDS } from './constants';
import {
  createBuildFinalLabelElement,
  createBuildNoteElement,
  createBuildResultElement,
  createBuildTitleElement,
  createCapturedImageElement,
  createEmptyViewportCaptionElement,
  createEmptyViewportImageElement,
  createImportedImageElement,
  createNoteCalloutElement,
  createStepBadge,
  createStepCallout,
  createStepTitle,
  createTargetArrowElement,
  createTargetHighlightElement,
} from './elements';

export function createScenarioVisualBaselineSlides(): ScenarioSlide[] {
  return [
    createCapturedAppSlide(),
    createEmptyViewportSlide(),
    createStepOneSlide(),
    createStepTwoBuildSlide(),
    createStepThreeSlide(),
    createImportedImageSlide(),
  ];
}

function createCapturedAppSlide(): ScenarioSlide {
  return createScenarioSlide({
    canvas: createCanvas('#efe4d2'),
    clicks: { count: 3, initialIndex: 2 },
    elements: [
      createCapturedImageElement(),
      createTargetHighlightElement(),
      createTargetArrowElement(),
      createNoteCalloutElement(),
    ],
    guide: {
      body: 'User-reported baseline: beige canvas, capture, note, click target, and side rail.',
      stepNumber: 1,
      targetSummary: 'Create scenario button',
    },
    id: SCENARIO_VISUAL_BASELINE_SLIDE_IDS.capturedApp,
    notes: 'Check whitespace, callout polish, target visibility, and slide rail balance.',
    title: 'Recorded Hatiqo-like app page',
  });
}

function createEmptyViewportSlide(): ScenarioSlide {
  return createScenarioSlide({
    canvas: createCanvas('#eee3d0'),
    elements: [createEmptyViewportImageElement(), createEmptyViewportCaptionElement()],
    id: SCENARIO_VISUAL_BASELINE_SLIDE_IDS.emptyViewport,
    notes: 'This slide keeps the whitespace problem visible for future layout passes.',
    title: 'Mostly empty app viewport',
  });
}

function createStepOneSlide(): ScenarioSlide {
  return createStepSlide({
    body: 'Open the account workspace and choose the active customer segment.',
    id: SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepOne,
    step: 1,
    title: 'Step 1 - Open workspace',
  });
}

function createStepTwoBuildSlide(): ScenarioSlide {
  return createScenarioSlide({
    canvas: createCanvas('#f1e6d3'),
    clicks: { count: 3, initialIndex: 0 },
    elements: [
      createStepBadge(2),
      createBuildTitleElement(),
      createBuildNoteElement(),
      createBuildResultElement(),
      createBuildFinalLabelElement(),
    ],
    id: SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepTwoBuild,
    notes: 'Presenter and play screenshots use this slide to prove build-step visibility.',
    title: 'Step 2 - Build sequence',
  });
}

function createStepThreeSlide(): ScenarioSlide {
  return createStepSlide({
    body: 'Review the generated deck in overview mode before exporting it.',
    id: SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepThree,
    step: 3,
    title: 'Step 3 - Review deck',
  });
}

function createImportedImageSlide(): ScenarioSlide {
  return createScenarioSlide({
    canvas: createCanvas('#eadfcd'),
    elements: [createImportedImageElement()],
    id: SCENARIO_VISUAL_BASELINE_SLIDE_IDS.importedImage,
    notes: 'Imported image slides must not fall back to a broken image placeholder.',
    title: 'Imported image slide',
  });
}

function createStepSlide(args: {
  body: string;
  id: string;
  step: number;
  title: string;
}): ScenarioSlide {
  return createScenarioSlide({
    canvas: createCanvas('#f2e7d5'),
    elements: [createStepBadge(args.step), createStepTitle(args), createStepCallout(args)],
    guide: { body: args.body, stepNumber: args.step, targetSummary: args.title },
    id: args.id,
    notes: args.body,
    title: args.title,
  });
}

function createCanvas(color: string): ScenarioSlide['canvas'] {
  return {
    background: { color, kind: 'solid' },
    height: 720,
    width: 1280,
  };
}
