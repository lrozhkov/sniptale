import { expect, it } from 'vitest';

import { createCaptureInput } from '../../../features/scenario/stage/capture-composition/fixtures.test-support.ts';
import { createScenarioCaptureSlide } from '../../../features/scenario/stage/capture-composition/slide';
import { renderScenarioSlide } from './slide/render';

it('renders recorded deck output as a nonblank build-driven visual harness slide', () => {
  const slide = createScenarioCaptureSlide(createCaptureInput());
  const assets = {
    'asset-capture': {
      height: 900,
      source: 'data:image/png;base64,abc',
      width: 1440,
    },
  };
  const initialRender = renderScenarioSlide(slide, { assets, clickIndex: 0, mode: 'export' });
  const revealedRender = renderScenarioSlide(slide, { assets, clickIndex: 1, mode: 'export' });

  expect(initialRender.elements.map((entry) => entry.element.role)).toEqual(['main-image']);
  expect(revealedRender.elements.map((entry) => entry.element.role)).toEqual([
    'main-image',
    'target-highlight',
    'connector',
    'click-marker',
    'step-note',
  ]);
  expect(revealedRender.svg).toContain('<image');
  expect(revealedRender.svg).not.toContain('Missing image');
  expect(revealedRender.svg).not.toContain('#f5f1ea');
});
