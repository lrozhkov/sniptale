// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { ScenarioCanvasZoomControls } from './controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderZoomControls(args: { scale: number; zoomMode: 'custom' | 'fit' }) {
  const controls = {
    onFit: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOne: vi.fn(),
    onZoomOut: vi.fn(),
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioCanvasZoomControls {...controls} {...args} />);
  });

  return controls;
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

it('routes the 100% zoom toggle back to fit mode', () => {
  const controls = renderZoomControls({ scale: 1, zoomMode: 'custom' });

  clickZoomToggle(translate('scenario.editor.fitToView'), 100);

  expect(controls.onFit).toHaveBeenCalledTimes(1);
  expect(controls.onZoomOne).not.toHaveBeenCalled();
});

it('routes an active fit zoom toggle to actual size', () => {
  const controls = renderZoomControls({ scale: 1.25, zoomMode: 'fit' });

  clickZoomToggle(translate('scenario.editor.zoomToActualSize'), 125);

  expect(controls.onZoomOne).toHaveBeenCalledTimes(1);
  expect(controls.onFit).not.toHaveBeenCalled();
});

function clickZoomToggle(actionLabel: string, zoomPercent: number) {
  const label = `${actionLabel} · ${translate('scenario.editor.zoomCurrentPrefix')} ${zoomPercent}%`;
  const button = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

  expect(button).not.toBeNull();
  act(() => {
    button?.click();
  });
}
