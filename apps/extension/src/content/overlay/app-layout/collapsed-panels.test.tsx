// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CollapsedPanels } from './collapsed-panels';

vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  useContentUiScale: () => 1,
  queryContentUiElement: (selector: string) => document.querySelector(selector),
  resolveContentShadowRoot: () => null,
}));

let root: Root;
let container: HTMLDivElement;
const captured = new Set<number>();
const release = vi.fn((pointerId: number) => captured.delete(pointerId));

function createProps() {
  return {
    countdownActive: false,
    toolbar: {
      isCompletelyHidden: false,
      isToolbarVisible: false,
      modes: { screenshotMode: true, videoRecordingMode: false },
      setPinnedToolbarVisible: vi.fn(),
    },
    scenario: {
      state: { captureAction: 'scenario' as const, scenarioEnabled: true, sidebarVisible: false },
      actions: { setSidebarVisible: vi.fn() },
    },
  };
}

function render(props: ReturnType<typeof createProps>) {
  act(() => root.render(<CollapsedPanels {...props} />));
}

function dock() {
  return container.querySelector<HTMLElement>('[data-ui="content.collapsed-panels"]')!;
}

function handle() {
  return container.querySelector<HTMLElement>('[data-ui="content.collapsed-panels.drag-handle"]')!;
}

function pointer(type: string, x: number, y: number, pointerId = 1, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  act(() => handle().dispatchEvent(event));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 560);
  captured.clear();
  release.mockClear();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: (pointerId: number) => captured.add(pointerId),
    },
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => captured.has(pointerId),
    },
    releasePointerCapture: { configurable: true, value: release },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(20, 20, 66, 38)
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  for (const method of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'])
    Reflect.deleteProperty(HTMLElement.prototype, method);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('groups equivalent compact restore buttons and invokes only the selected latest action', () => {
  const props = createProps();
  render(props);
  const buttons = [...dock().querySelectorAll('button:not(.sniptale-drag-handle)')];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button.className).toContain('sniptale-btn-compact');
    expect(button.className).toContain('sniptale-btn-utility');
    expect(button.getAttribute('aria-label')).toBeTruthy();
    expect(button.querySelector('svg')?.getAttribute('width')).toBe('16');
  }
  props.toolbar.setPinnedToolbarVisible = vi.fn();
  render(props);
  act(() => buttons[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(props.toolbar.setPinnedToolbarVisible).toHaveBeenCalledExactlyOnceWith(true);
  expect(props.scenario.actions.setSidebarVisible).not.toHaveBeenCalled();
  props.toolbar.isToolbarVisible = true;
  render(props);
  expect(dock().querySelectorAll('button:not(.sniptale-drag-handle)')).toHaveLength(1);
  expect(dock().querySelector('button:not(.sniptale-drag-handle)')).toBe(buttons[1]);
  act(() => buttons[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(props.scenario.actions.setSidebarVisible).toHaveBeenCalledExactlyOnceWith(true);
});

it('hides during countdown, capture and inactive modes without losing the committed corner', () => {
  const props = createProps();
  render(props);
  act(() =>
    handle().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
  );
  expect(dock().dataset['corner']).toBe('bottom-left');
  props.countdownActive = true;
  render(props);
  expect(dock()).toBeNull();
  props.countdownActive = false;
  props.toolbar.isCompletelyHidden = true;
  render(props);
  expect(dock()).toBeNull();
  props.toolbar.isCompletelyHidden = false;
  render(props);
  expect(dock().dataset['corner']).toBe('bottom-left');
  props.scenario.state.sidebarVisible = true;
  props.toolbar.modes.screenshotMode = false;
  render(props);
  expect(dock()).toBeNull();
  props.toolbar.modes.videoRecordingMode = true;
  render(props);
  expect(dock().querySelectorAll('button:not(.sniptale-drag-handle)')).toHaveLength(1);
  expect(dock().dataset['corner']).toBe('bottom-left');
});

it('captures a thresholded drag, clamps it, shows four guides, and docks without activating actions', () => {
  const props = createProps();
  render(props);
  pointer('pointerdown', 30, 30);
  pointer('pointermove', 31, 31);
  expect(dock().dataset['dragging']).toBe('false');
  pointer('pointermove', 1200, 500, 2);
  expect(dock().dataset['dragging']).toBe('false');
  pointer('pointermove', -50, -50);
  expect(dock().style.left).toBe('0px');
  expect(dock().style.top).toBe('0px');
  expect(container.querySelectorAll('[data-active]')).toHaveLength(4);
  pointer('pointerup', 20, 20);
  expect(dock().dataset['corner']).toBe('top-left');
  expect(dock().dataset['dragging']).toBe('false');
  expect(container.querySelector('[data-active]')).toBeNull();
  expect(release).toHaveBeenCalledExactlyOnceWith(1);
  expect(props.toolbar.setPinnedToolbarVisible).not.toHaveBeenCalled();
  expect(props.scenario.actions.setSidebarVisible).not.toHaveBeenCalled();
  props.scenario.state.sidebarVisible = true;
  render(props);
  expect(dock().dataset['corner']).toBe('top-left');
});

it.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'hide', 'resize'])(
  'cancels %s without committing a new corner or retaining capture',
  (reason) => {
    const props = createProps();
    render(props);
    pointer('pointerdown', 30, 30);
    pointer('pointermove', 100, 100);
    if (reason === 'hide') {
      props.toolbar.isCompletelyHidden = true;
      render(props);
      props.toolbar.isCompletelyHidden = false;
      render(props);
    } else if (reason === 'Escape') {
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    } else if (reason === 'blur' || reason === 'resize') {
      act(() => window.dispatchEvent(new Event(reason)));
    } else {
      pointer(reason, 100, 100);
    }
    expect(dock().dataset['corner']).toBe('bottom-right');
    expect(dock().dataset['dragging']).toBe('false');
    expect(captured.size).toBe(0);
  }
);

it('releases an active pointer and removes listeners on unmount', () => {
  render(createProps());
  pointer('pointerdown', 30, 30);
  pointer('pointermove', 100, 100);
  act(() => root.render(null));
  expect(captured.size).toBe(0);
  expect(release).toHaveBeenCalledExactlyOnceWith(1);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(release).toHaveBeenCalledTimes(1);
});

it('supports all corner directions from the focusable handle', () => {
  render(createProps());
  for (const [key, corner] of [
    ['ArrowUp', 'top-right'],
    ['ArrowLeft', 'top-left'],
    ['ArrowDown', 'bottom-left'],
    ['ArrowRight', 'bottom-right'],
  ] as const) {
    act(() => handle().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key })));
    expect(dock().dataset['corner']).toBe(corner);
  }
});

it('uses native command activation and cancels armed Space without restoring a panel', () => {
  const props = createProps();
  render(props);
  expect(handle().tagName).toBe('BUTTON');
  const key = (type: string, value: string, repeat = false) => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: value, repeat });
    act(() => handle().dispatchEvent(event));
    return event;
  };
  key('keydown', 'Enter');
  act(() => handle().click());
  expect(dock().dataset['corner']).toBe('bottom-left');
  expect(key('keydown', 'Enter', true).defaultPrevented).toBe(true);
  key('keyup', 'Enter');
  key('keydown', ' ');
  expect(dock().dataset['corner']).toBe('bottom-left');
  key('keydown', 'Escape');
  expect(key('keyup', ' ').defaultPrevented).toBe(true);
  expect(dock().dataset['corner']).toBe('bottom-left');
  key('keydown', ' ');
  expect(key('keyup', ' ').defaultPrevented).toBe(false);
  act(() => handle().click());
  expect(dock().dataset['corner']).toBe('top-left');
  act(() => handle().click());
  expect(dock().dataset['corner']).toBe('top-right');
  expect(props.toolbar.setPinnedToolbarVisible).not.toHaveBeenCalled();
  expect(props.scenario.actions.setSidebarVisible).not.toHaveBeenCalled();
});

it('waits for a lazily restored panel before moving keyboard focus and disconnects observation', async () => {
  const props = createProps();
  const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
  render(props);
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.restore"]')!
      .click()
  );
  props.scenario.state.sidebarVisible = true;
  render(props);
  const project = document.createElement('button');
  project.dataset['ui'] = 'content.scenario.sidebar.project-button';
  await act(async () => {
    document.body.append(project);
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(project);
  expect(disconnect).toHaveBeenCalled();
});

it('does not steal focus when the user interacts before the restored panel arrives', async () => {
  const props = createProps();
  render(props);
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="content.scenario.sidebar.restore"]')!
      .click()
  );
  const other = document.createElement('button');
  document.body.append(other);
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    other.focus();
  });
  const project = document.createElement('button');
  project.dataset['ui'] = 'content.scenario.sidebar.project-button';
  await act(async () => {
    document.body.append(project);
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(other);
});
