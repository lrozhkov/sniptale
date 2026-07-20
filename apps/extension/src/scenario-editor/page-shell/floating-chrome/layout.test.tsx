// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { ScenarioV3FloatingChrome } from '.';
import { createFloatingProps } from './test-support';
import type { ScenarioV3FloatingChromeProps } from './types';

vi.mock('../../inspector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector')>()),
  ScenarioInspectorPanel: (props: { embedded?: boolean; hideLayers?: boolean }) => (
    <div
      data-embedded={String(props.embedded)}
      data-hide-layers={String(props.hideLayers)}
      data-testid="floating-inspector"
    />
  ),
}));

vi.mock('../../inspector/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/layers')>()),
  ScenarioLayersInspector: (props: {
    layersCollapsible?: boolean;
    onSelectElement: (elementId: string) => void;
  }) => (
    <div data-collapsible={String(props.layersCollapsible)} data-testid="floating-layers-panel">
      <button
        type="button"
        aria-label="select floating layer"
        onClick={() => props.onSelectElement('element-1')}
      />
    </div>
  ),
}));

vi.mock('../slide-rail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../slide-rail')>()),
  ScenarioSlideRail: (props: { embedded?: boolean; onSelectSlide: (slideId: string) => void }) => (
    <div data-embedded={String(props.embedded)} data-testid="floating-slide-rail">
      <button
        type="button"
        aria-label="select floating slide"
        onClick={() => props.onSelectSlide('slide-1')}
      />
    </div>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders separate slide, layers, and inspector floating panels', () => {
  renderChrome(createFloatingProps());

  expect(container?.querySelector('[data-testid="floating-slide-rail"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="floating-layers-panel"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="floating-inspector"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="floating-inspector"]')).toHaveProperty(
    'dataset',
    expect.objectContaining({ hideLayers: 'true' })
  );
});

it('keeps slide and layer panels visible while the right inspector collapses', () => {
  renderChrome(createFloatingProps());

  clickByLabel(translate('editor.toolbar.collapseInspector'));
  expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
  expect(container?.querySelector('[data-testid="floating-slide-rail"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="floating-layers-panel"]')).not.toBeNull();

  clickByLabel(translate('scenario.editor.inspector'));
  expect(container?.querySelector('[data-testid="floating-inspector"]')).not.toBeNull();
});

it('hides only the right inspector lane when an external panel owns that side', () => {
  renderChrome(createFloatingProps({ rightPanelHidden: true }));

  expect(container?.querySelector('[data-testid="floating-inspector"]')).toBeNull();
  expect(container?.querySelector('[data-testid="floating-slide-rail"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="floating-layers-panel"]')).not.toBeNull();
});

it('anchors insert, workspace, split, and timeline chrome in their floating safe areas', () => {
  renderChrome(createFloatingProps());

  const insertPanel = queryUi('scenario.floating.insert-panel');
  const insertStack = queryUi('scenario.floating.insert-panel.stack');
  const workspacePanel = queryUi('scenario.floating.workspace-panel');
  const timeline = queryUi('scenario.floating.build-timeline');

  expect(insertStack?.className).toContain('left-1/2');
  expect(insertPanel?.className).toContain('flex-row');
  expect(workspacePanel).not.toBeNull();
  expect(timeline?.className).toContain('left-[21rem]');
  expect(timeline?.className).toContain('right-[24rem]');
  expect(timeline?.className).toContain('max-w-[760px]');
});

it('clears active tools before selecting slides and layers from the left stack', () => {
  const props = createFloatingProps();
  renderChrome(props);

  clickByLabel('select floating slide');
  clickByLabel('select floating layer');

  expect(props.onClearInspectorTool).toHaveBeenCalledTimes(2);
  expect(props.editor.slideActions.selectSlide).toHaveBeenCalledWith('slide-1');
  expect(props.editor.elementActions.selectElement).toHaveBeenCalledWith('element-1');
});

it('resizes the slide/layers split and hides the compact timeline on demand', () => {
  renderChrome(createFloatingProps());

  const slidePanel = queryUi('scenario.floating.slide-panel');
  const handle = buttonByLabel(translate('scenario.editor.layers'));
  setRect(handle.parentElement, { bottom: 600, height: 500, top: 100 });

  act(() => {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    handle.dispatchEvent(createPointerEvent('pointermove', { clientY: 460 }));
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    handle.dispatchEvent(createPointerEvent('pointerdown', { clientY: 360 }));
    handle.dispatchEvent(createPointerEvent('pointermove', { clientY: 460 }));
  });
  expect(slidePanel?.style.flexBasis).toBe('72%');

  act(() => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
  });
  expect(slidePanel?.style.flexBasis).toBe('67%');
  act(() => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });
  expect(slidePanel?.style.flexBasis).toBe('72%');

  clickByLabel(
    `${translate('scenario.editor.buildTimeline')} · ${translate(
      'editor.toolbar.collapseInspector'
    )}`
  );
});

it('routes compact timeline visibility through the shell-owned hidden state', () => {
  const props = createFloatingProps();
  renderChrome(props);

  clickByLabel(
    `${translate('scenario.editor.buildTimeline')} · ${translate(
      'editor.toolbar.collapseInspector'
    )}`
  );
  expect(props.onTimelineHiddenChange).toHaveBeenCalledWith(true);

  renderChrome({ ...props, timelineHidden: true });
  expect(queryUi('scenario.floating.build-timeline')).toBeNull();
  expect(queryUi('scenario.floating.build-timeline.hidden')).not.toBeNull();

  clickByLabel(translate('scenario.editor.buildTimeline'));
  expect(props.onTimelineHiddenChange).toHaveBeenCalledWith(false);
});

function renderChrome(props: ScenarioV3FloatingChromeProps) {
  act(() => {
    root?.render(<ScenarioV3FloatingChrome {...props} />);
  });
}

function buttonByLabel(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"], [title="${label}"]`
  );
  if (!button) {
    throw new Error(`Expected button ${label}`);
  }
  return button;
}

function clickByLabel(label: string) {
  act(() => buttonByLabel(label).click());
}

function queryUi(dataUi: string) {
  return container?.querySelector<HTMLElement>(`[data-ui="${dataUi}"]`) ?? null;
}

function createPointerEvent(type: string, init: PointerEventInit) {
  return new MouseEvent(type, { bubbles: true, clientY: init.clientY ?? 0 });
}

function setRect(element: Element | null, rect: Partial<DOMRect>) {
  if (!element) {
    throw new Error('Expected element for rect');
  }
  element.getBoundingClientRect = () =>
    ({
      bottom: rect.bottom ?? 0,
      height: rect.height ?? 0,
      left: 0,
      right: 0,
      top: rect.top ?? 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect;
}
