// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioSlide } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { SlideInspector } from './slide';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('does not expose presentation, layout, animation, click, or canvas settings', () => {
  act(() => {
    root?.render(
      <SlideInspector slide={createScenarioSlide({ title: 'Intro' })} onUpdateSlide={vi.fn()} />
    );
  });

  expect(container?.textContent).toContain(translate('scenario.editor.stepDetails'));
  for (const removedLabel of [
    'scenario.editor.presentation',
    'scenario.editor.layout',
    'scenario.editor.transition',
    'scenario.editor.backgroundTransition',
    'scenario.editor.clicks',
    'scenario.editor.canvas',
  ] as const) {
    expect(container?.textContent).not.toContain(translate(removedLabel));
  }
});
