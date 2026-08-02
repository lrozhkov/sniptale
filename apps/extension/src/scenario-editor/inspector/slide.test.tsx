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

it('shows only title and notes even when legacy presentation data exists', () => {
  act(() => {
    root?.render(
      <SlideInspector
        slide={createScenarioSlide({
          backgroundTransition: null,
          canvas: { background: { kind: 'transparent' }, height: 720, width: 1280 },
          transition: null,
        })}
        onUpdateSlide={vi.fn()}
      />
    );
  });

  expect(container?.textContent).toContain(translate('scenario.editor.stepDetails'));
  expect(container?.textContent).not.toContain(translate('scenario.editor.transitionNone'));
  expect(container?.querySelector('[data-ui="shared.ui.color-selector"]')).toBeNull();
});
