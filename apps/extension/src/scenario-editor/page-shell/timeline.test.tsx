// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioSlide, createScenarioTextElement } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { ScenarioBuildTimeline } from './timeline';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderTimeline() {
  const onClickIndexChange = vi.fn();
  const element = {
    ...createScenarioTextElement({
      build: { hideAtClick: 3, order: 0, showAtClick: 1 },
      name: 'Build note',
    }),
    id: 'element-1',
  };
  const slide = createScenarioSlide({
    clicks: { count: 3, initialIndex: 0 },
    elements: [element],
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioBuildTimeline
        clickIndex={1}
        onClickIndexChange={onClickIndexChange}
        selectedElementId="element-1"
        slide={slide}
      />
    );
  });

  return { onClickIndexChange };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows discrete build markers and selected element visibility states', () => {
  const { onClickIndexChange } = renderTimeline();

  expect(container?.querySelector('[data-ui="scenario.editor.build-timeline"]')).not.toBeNull();
  expect(container?.querySelector('[data-selected-element-state="hidden"]')).not.toBeNull();
  expect(container?.querySelector('[data-selected-element-state="entering"]')).not.toBeNull();
  expect(container?.querySelector('[data-selected-element-state="visible"]')).not.toBeNull();
  expect(container?.querySelector('[data-selected-element-state="exiting"]')).not.toBeNull();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('scenario.editor.buildStep')} 2"]`
      )
      ?.click();
  });

  expect(onClickIndexChange).toHaveBeenCalledWith(2);
  expect(container?.textContent).toContain('Build note');
});
