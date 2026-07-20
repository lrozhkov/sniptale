import { expect, it } from 'vitest';

import type {
  ScenarioElement,
  ScenarioElementFrame,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { createCaptureInput } from './fixtures.test-support.ts';
import { createScenarioCaptureSlide } from './slide';
import { framesOverlap } from './placement';

it('creates polished Hatiqo-like capture slides with semantic roles and build fragments', () => {
  const slide = createScenarioCaptureSlide(createCaptureInput());

  expect(getRoles(slide.elements)).toEqual([
    'main-image',
    'target-highlight',
    'connector',
    'click-marker',
    'step-note',
  ]);
  expect(slide.clicks).toEqual({ count: 1, initialIndex: 1 });
  expect(slide.layout).toMatchObject({ compositionPreset: 'note-grid', layoutId: 'step-guide' });
  expect(slide.notes).toContain('Click the scenario action');
  expect(slide.guide).toMatchObject({ stepNumber: 1, targetSummary: 'Open scenario editor' });
  expect(slide.elements.map((element) => element.build.showAtClick)).toEqual([0, 1, 1, 1, 1]);
});

it('keeps callouts away from target and click overlays', () => {
  const slide = createScenarioCaptureSlide(createCaptureInput());
  const callout = getElementFrame(slide.elements, 'step-note');
  const target = getElementFrame(slide.elements, 'target-highlight');
  const click = getElementFrame(slide.elements, 'click-marker');

  expect(framesOverlap(callout, target)).toBe(false);
  expect(framesOverlap(callout, click)).toBe(false);
});

it('turns sparse viewport captures into useful explanatory slides', () => {
  const slide = createScenarioCaptureSlide(
    createCaptureInput({
      body: 'This empty workspace is ready; the next action starts the customer setup.',
      cursorPoint: null,
      interactionPoint: null,
      target: null,
    })
  );

  expect(getRoles(slide.elements)).toEqual(['main-image', 'step-note']);
  expect(slide.layout.layoutId).toBe('screenshot-callout');
  expect(getElementFrame(slide.elements, 'main-image').width).toBeGreaterThan(1200);
  expect(slide.guide?.body).toContain('This empty workspace is ready');
});

it('degrades missing metadata to a clean screenshot-focus slide', () => {
  const slide = createScenarioCaptureSlide(
    createCaptureInput({
      body: '',
      cursorPoint: null,
      interactionPoint: null,
      target: null,
      title: '',
    })
  );

  expect(getRoles(slide.elements)).toEqual(['main-image']);
  expect(slide.clicks).toEqual({ count: 0, initialIndex: 0 });
  expect(slide.layout.layoutId).toBe('screenshot-focus');
  expect(slide.title).toBe('Hatiqo customer workspace');
});

it('handles missing target or click point without drifting the remaining overlay', () => {
  const missingTarget = createScenarioCaptureSlide(createCaptureInput({ target: null }));
  const missingClick = createScenarioCaptureSlide(createCaptureInput({ interactionPoint: null }));

  expect(getRoles(missingTarget.elements)).not.toContain('target-highlight');
  expect(getRoles(missingTarget.elements)).toContain('click-marker');
  expect(getRoles(missingClick.elements)).toContain('target-highlight');
  expect(getRoles(missingClick.elements)).not.toContain('click-marker');
});

function getRoles(elements: ScenarioElement[]): Array<string | null> {
  return elements.map((element) => element.role);
}

function getElementFrame(elements: ScenarioElement[], role: string): ScenarioElementFrame {
  const element = elements.find((candidate) => candidate.role === role);
  if (!element) {
    throw new Error(`Missing element with role ${role}`);
  }

  return element.frame;
}
