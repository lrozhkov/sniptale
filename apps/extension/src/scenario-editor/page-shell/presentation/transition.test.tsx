// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderScenarioSlide } from '../../project/stage-render/slide';
import {
  createScenarioSlide,
  createScenarioTextElement,
} from '../../../features/scenario/project/v3';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioPresentationSlideFrame } from './transition';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSlide(id: string, title: string): ScenarioSlide {
  return createScenarioSlide({
    backgroundTransition: { durationMs: 240, easing: 'ease', kind: 'zoom' },
    elements: [createScenarioTextElement({ text: title })],
    id,
    title,
    transition:
      id === 'slide-1'
        ? { durationMs: 240, easing: 'ease', kind: 'fade' }
        : { durationMs: 240, easing: 'ease', kind: 'none' },
  });
}

function renderFrame(slide: ScenarioSlide, clickIndex = 0) {
  const rendered = renderScenarioSlide(slide, { clickIndex, mode: 'export' });
  act(() => {
    root?.render(<ScenarioPresentationSlideFrame clickIndex={clickIndex} rendered={rendered} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('keeps outgoing slides during calm transitions and falls back to background transition', () => {
  renderFrame(createSlide('slide-1', 'First'));
  renderFrame(createSlide('slide-2', 'Second'));

  expect(
    container?.querySelector('[data-ui="scenario.presentation.slide-outgoing"]')
  ).not.toBeNull();
  expect(container?.querySelector('[data-background-transition="zoom"]')).not.toBeNull();
  expect(
    container?.querySelector<HTMLElement>('[data-ui="scenario.presentation.slide-current"]')?.style
      .animationName
  ).toBe('sniptaleScenarioZoomIn');

  renderFrame(createSlide('slide-2', 'Second'), 1);
  act(() => {
    vi.advanceTimersByTime(260);
  });

  expect(container?.querySelector('[data-ui="scenario.presentation.slide-outgoing"]')).toBeNull();
});
