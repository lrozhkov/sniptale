// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { ScenarioV3FloatingChrome } from '.';
import { createFloatingProps } from './test-support';

vi.mock('../../inspector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector')>()),
  ScenarioInspectorPanel: () => <div data-testid="floating-inspector" />,
}));

vi.mock('../slide-rail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../slide-rail')>()),
  ScenarioSlideRail: (props: { onSelectSlide: (slideId: string) => void }) => (
    <button
      type="button"
      data-testid="floating-step-rail"
      onClick={() => props.onSelectSlide('step-1')}
    />
  ),
}));

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

it('renders one step rail and one contextual inspector without layers or timeline', () => {
  renderChrome(createFloatingProps());

  expect(container?.querySelector('[data-testid="floating-step-rail"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="floating-inspector"]')).not.toBeNull();
  expect(queryUi('scenario.floating.layers-panel')).toBeNull();
  expect(queryUi('scenario.floating.build-timeline')).toBeNull();
  expect(queryUi('scenario.floating.insert-panel')).not.toBeNull();
  expect(queryUi('scenario.floating.workspace-panel')).not.toBeNull();
});

it('keeps the step rail visible while the inspector is hidden or collapsed', () => {
  renderChrome(createFloatingProps({ rightPanelHidden: true }));
  expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
  expect(container?.querySelector('[data-testid="floating-step-rail"]')).not.toBeNull();

  renderChrome(createFloatingProps());
  click(translate('editor.toolbar.collapseInspector'));
  expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
  expect(queryUi('scenario.floating.inspector.expand')).not.toBeNull();
});

it('selects steps through the only left-side navigation owner', () => {
  const props = createFloatingProps();
  renderChrome(props);
  act(() =>
    container?.querySelector<HTMLButtonElement>('[data-testid="floating-step-rail"]')?.click()
  );

  expect(props.onClearInspectorTool).toHaveBeenCalledOnce();
  expect(props.editor.slideActions.selectSlide).toHaveBeenCalledWith('step-1');
});

function renderChrome(props: React.ComponentProps<typeof ScenarioV3FloatingChrome>) {
  act(() => root?.render(<ScenarioV3FloatingChrome {...props} />));
}

function click(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"], [title="${label}"]`
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function queryUi(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) ?? null;
}
