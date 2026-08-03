// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { ScenarioV3EditorShell } from './view';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
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

it('does not expose presenter or audience-screen routes in guide authoring', () => {
  act(() => {
    root?.render(
      <ScenarioV3EditorShell project={createScenarioProjectV3('Guide')} onProjectChange={vi.fn()} />
    );
  });

  expect(button(translate('scenario.editor.modeEdit'))).not.toBeNull();
  expect(button(translate('scenario.editor.modePlay'))).not.toBeNull();
  expect(button(translate('scenario.editor.modePresenter'))).toBeNull();
  expect(button(translate('scenario.editor.modeOverview'))).toBeNull();
  expect(button(translate('scenario.editor.openAudienceScreen'))).toBeNull();
});

it('switches directly between guide editing and preview', () => {
  act(() => {
    root?.render(
      <ScenarioV3EditorShell project={createScenarioProjectV3('Guide')} onProjectChange={vi.fn()} />
    );
  });

  act(() =>
    button(translate('scenario.editor.modePlay'))?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
  );
  expect(container?.querySelector('[data-ui="scenario.editor.v3.play"]')).not.toBeNull();

  act(() =>
    button(translate('scenario.editor.modeEdit'))?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
  );
  expect(container?.querySelector('[data-ui="scenario.canvas.stage"]')).not.toBeNull();
});

function button(label: string) {
  return container?.querySelector(`[aria-label="${label}"], [title="${label}"]`) ?? null;
}
