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
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders transparent and null-transition slide controls without a color selector', () => {
  const onUpdateSlide = vi.fn();
  const slide = createScenarioSlide({
    backgroundTransition: null,
    canvas: { background: { kind: 'transparent' }, height: 720, width: 1280 },
    transition: null,
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<SlideInspector slide={slide} onUpdateSlide={onUpdateSlide} />);
  });
  openSelect(translate('scenario.editor.background'));
  act(() => {
    findOption(translate('scenario.editor.backgroundSolid'))?.click();
  });

  expect(container?.querySelector('[data-ui="shared.ui.color-selector"]')).toBeNull();
  expect(container?.textContent).toContain(translate('scenario.editor.transitionNone'));
  expect(onUpdateSlide).toHaveBeenCalledWith({
    canvas: { background: { color: '#ffffff', kind: 'solid' } },
  });
});

function openSelect(label: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
}

function findOption(label: string) {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).find((option) => option.textContent?.includes(label));
}
