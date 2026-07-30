// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../types';

vi.mock('../settings/view', () => ({
  DesignReviewSettings: () => <div data-ui="compact-settings" />,
}));

import { DesignReviewPopover } from './view';

const actions: DesignReviewActions = {
  close: vi.fn(),
  comment: {
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
  },
  copyElement: vi.fn(async () => undefined),
  copyPath: vi.fn(async () => undefined),
  delete: vi.fn(),
  resetValue: vi.fn(),
  selectAction: vi.fn(),
  setSettingsOpen: vi.fn(),
  setSideFieldLinked: vi.fn(),
  updateValue: vi.fn(),
  updateValues: vi.fn(),
};

const element = document.createElement('h1');
const state: DesignReviewViewState = {
  action: 'refine',
  anchor: { x: 40, y: 40 },
  comment: { commitFailed: false, draft: '', marker: null },
  defaultValues: {},
  draftPatch: { declarations: [] },
  modifiedProperties: [],
  selection: {
    domPath: 'html > body > main > h1:nth-of-type(1)',
    element,
    kind: 'text',
    patch: { declarations: [] },
    selectorLabel: 'h1:nth-of-type(1)',
    tagName: 'h1',
    textPreview: 'Heading',
  },
  settingsOpen: true,
  values: {},
};

function dispatchPointer(
  target: Element,
  type: string,
  args: { clientX: number; clientY: number; pointerId: number }
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: args.clientX,
    clientY: args.clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: args.pointerId });
  target.dispatchEvent(event);
}

it('renders the mock-aligned comment, action, element bar, and compact settings', () => {
  const markup = renderToStaticMarkup(
    <DesignReviewPopover actions={actions} open={true} state={state} />
  );

  expect(markup).toContain('content.design-review.popover');
  expect(markup).toContain('Что нужно изменить или проверить?');
  expect(markup).toContain('Доработать');
  expect(markup).toContain('html &gt; body &gt; main &gt; h1:nth-of-type(1)');
  expect(markup).toContain('compact-settings');
  expect(markup).not.toContain('input type="file"');
  expect(markup).not.toContain('Enter — готово');
});

it('shows the current selector while exposing localized tag help and the full path on hover', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <DesignReviewPopover actions={actions} open={true} state={state} />
  );

  expect(
    root.querySelector('[data-ui="content.design-review.element-selector"]')?.textContent
  ).toBe('h1:nth-of-type(1)');
  expect(
    root.querySelector('[data-ui="content.design-review.full-path-tooltip"]')?.textContent
  ).toBe('html > body > main > h1:nth-of-type(1)');
  expect(
    root.querySelector('[data-ui="content.design-review.full-path-tooltip"]')?.className
  ).toContain('group-hover:visible');
  expect(
    root.querySelector('[data-ui="content.design-review.element-tag-tooltip"]')?.textContent
  ).toBe('<h1> — заголовок');
});

it('does not render without an active click selection', () => {
  expect(
    renderToStaticMarkup(<DesignReviewPopover actions={actions} open={false} state={state} />)
  ).toBe('');
});

it('uses the danger color for Fix but not for the other selected actions', () => {
  const renderActionButton = (action: DesignReviewViewState['action']) => {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      <DesignReviewPopover actions={actions} open={true} state={{ ...state, action }} />
    );
    return [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(action === 'fix' ? 'Исправить' : 'Доработать')
    );
  };

  expect(renderActionButton('fix')?.className).toContain('text-[var(--sniptale-color-danger)]');
  expect(renderActionButton('refine')?.className).not.toContain(
    'text-[var(--sniptale-color-danger)]'
  );
});

it('keeps the action menu interactive across the content shadow boundary', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const root = createRoot(shadowRoot);
  const selectAction = vi.fn();

  try {
    act(() => {
      root.render(
        <DesignReviewPopover
          actions={{ ...actions, selectAction }}
          open={true}
          state={{ ...state, settingsOpen: false }}
        />
      );
    });
    const trigger = shadowRoot.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!trigger) throw new Error('Expected action menu trigger');
    act(() => trigger.click());
    const fixOption = [
      ...shadowRoot.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ].find((button) => button.textContent?.includes('Исправить'));
    if (!fixOption) throw new Error('Expected Fix action');

    act(() => {
      fixOption.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, composed: true, cancelable: true })
      );
    });
    expect(
      shadowRoot.querySelector('[data-ui="content.design-review.action-menu"]')
    ).not.toBeNull();

    act(() => fixOption.click());
    expect(selectAction).toHaveBeenCalledWith('fix');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('measures and reclamps base, delete, and action-menu states inside the viewport', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let viewportWidth = 320;
  let viewportHeight = 240;
  vi.spyOn(window, 'innerWidth', 'get').mockImplementation(() => viewportWidth);
  vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => viewportHeight);
  let resizeCallback: ResizeObserverCallback | null = null;
  class ResizeObserverHarness {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback;
    }

    disconnect() {}
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverHarness);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <DesignReviewPopover
          actions={actions}
          open={true}
          state={{ ...state, anchor: { x: 310, y: 230 } }}
        />
      );
    });
    const popover = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.popover"]'
    );
    if (!popover || !resizeCallback) {
      throw new Error('Expected measured Design Review popover');
    }
    let popoverHeight = 180;
    vi.spyOn(popover, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: popoverHeight,
      height: popoverHeight,
      left: 0,
      right: 296,
      toJSON: () => ({}),
      top: 0,
      width: 296,
      x: 0,
      y: 0,
    }));

    act(() => {
      (resizeCallback as ResizeObserverCallback)([], {} as ResizeObserver);
    });

    expect(popover.style.left).toBe('12px');
    expect(popover.style.top).toBe('38px');
    expect(popover.style.width).toBe('296px');

    viewportWidth = 280;
    viewportHeight = 150;
    act(() => window.dispatchEvent(new Event('resize')));

    expect(popover.style.left).toBe('12px');
    expect(popover.style.top).toBe('12px');
    expect(popover.style.width).toBe('256px');
    expect(
      popover.querySelector<HTMLElement>('[data-ui="content.design-review.popover-layout"]')?.style
        .maxHeight
    ).toBe('126px');

    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить замечание"]'
    );
    if (!deleteButton) {
      throw new Error('Expected delete action');
    }
    popoverHeight = 320;
    act(() => deleteButton.click());
    act(() => {
      (resizeCallback as ResizeObserverCallback)([], {} as ResizeObserver);
    });
    const deleteConfirmation = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.delete-confirmation"]'
    );
    expect(deleteConfirmation).not.toBeNull();
    expect(deleteConfirmation?.className).not.toContain('absolute');
    expect(deleteConfirmation?.closest('.overflow-y-auto')).not.toBeNull();
    expect(popover.style.top).toBe('12px');

    const cancelButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Отмена'
    );
    if (!cancelButton) {
      throw new Error('Expected delete cancellation');
    }
    act(() => cancelButton.click());
    act(() => {
      root.render(
        <DesignReviewPopover
          actions={actions}
          open={true}
          state={{ ...state, anchor: { x: 12, y: 0 } }}
        />
      );
    });
    const actionButton = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!actionButton) {
      throw new Error('Expected action menu trigger');
    }
    expect(actionButton.closest('[data-ui="content.design-review.comment"]')).not.toBeNull();
    popoverHeight = 360;
    act(() => actionButton.click());
    act(() => {
      (resizeCallback as ResizeObserverCallback)([], {} as ResizeObserver);
    });
    const actionMenu = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.action-menu"]'
    );
    expect(actionMenu).not.toBeNull();
    expect(actionMenu?.className).toContain('absolute');
    expect(actionMenu?.closest('.overflow-y-auto')).toBeNull();
    expect(actionMenu?.closest('[data-ui="content.design-review.comment-layer"]')).not.toBeNull();
    expect(popover.style.top).toBe('12px');

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
      );
    });
    expect(container.querySelector('[data-ui="content.design-review.action-menu"]')).toBeNull();
    expect(document.activeElement).toBe(actionButton);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it('positions outside the selected element when space is available', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: 130,
    height: 50,
    left: 100,
    right: 200,
    toJSON: () => ({}),
    top: 80,
    width: 100,
    x: 100,
    y: 80,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <DesignReviewPopover
          actions={actions}
          open={true}
          state={{ ...state, settingsOpen: false }}
        />
      );
    });
    const popover = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.popover"]'
    );
    expect(popover?.style.left).toBe('212px');
    expect(popover?.style.top).toBe('80px');
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it('positions outside a nested iframe target in top-viewport coordinates', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  const setRect = (
    target: Element,
    rect: { height: number; width: number; x: number; y: number }
  ) => {
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => DOMRect.fromRect(rect),
    });
  };
  const outerIframe = document.createElement('iframe');
  document.body.append(outerIframe);
  const outerDocument = outerIframe.contentDocument;
  if (!outerDocument) throw new Error('Expected outer iframe document');
  const innerIframe = outerDocument.createElement('iframe');
  outerDocument.body.append(innerIframe);
  const innerDocument = innerIframe.contentDocument;
  if (!innerDocument) throw new Error('Expected inner iframe document');
  const target = innerDocument.createElement('button');
  target.textContent = 'Nested target';
  innerDocument.body.append(target);
  Object.defineProperty(outerDocument.defaultView, 'frameElement', {
    configurable: true,
    value: outerIframe,
  });
  Object.defineProperty(innerDocument.defaultView, 'frameElement', {
    configurable: true,
    value: innerIframe,
  });
  Object.defineProperties(outerIframe, {
    clientLeft: { configurable: true, value: 3 },
    clientTop: { configurable: true, value: 4 },
    offsetHeight: { configurable: true, value: 120 },
    offsetWidth: { configurable: true, value: 160 },
  });
  Object.defineProperties(innerIframe, {
    clientLeft: { configurable: true, value: 1 },
    clientTop: { configurable: true, value: 2 },
    offsetHeight: { configurable: true, value: 25 },
    offsetWidth: { configurable: true, value: 50 },
  });
  setRect(outerIframe, { height: 240, width: 320, x: 100, y: 200 });
  setRect(innerIframe, { height: 50, width: 100, x: 10, y: 20 });
  setRect(target, { height: 6, width: 5, x: 3, y: 4 });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <DesignReviewPopover
          actions={actions}
          open={true}
          state={{
            ...state,
            anchor: { x: 152, y: 284 },
            selection: { ...state.selection!, element: target },
            settingsOpen: false,
          }}
        />
      );
    });
    const popover = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.popover"]'
    );
    expect(popover?.style.left).toBe('174px');
    expect(popover?.style.top).toBe('272px');
  } finally {
    act(() => root.unmount());
    container.remove();
    outerIframe.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it('moves from the divider drag zone and stays clamped to the viewport', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  let resizeCallback: ResizeObserverCallback | null = null;
  class ResizeObserverHarness {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback;
    }

    disconnect() {}
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverHarness);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let popoverHeight = 300;

  try {
    act(() => {
      root.render(
        <DesignReviewPopover
          actions={actions}
          open={true}
          state={{ ...state, settingsOpen: false }}
        />
      );
    });
    const popover = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.popover"]'
    );
    const handle = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.popover-drag-handle"]'
    );
    if (!popover || !handle) throw new Error('Expected draggable Design Review popover');
    vi.spyOn(popover, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: 52 + popoverHeight,
      height: popoverHeight,
      left: 52,
      right: 532,
      toJSON: () => ({}),
      top: 52,
      width: 480,
      x: 52,
      y: 52,
    }));
    Object.defineProperties(handle, {
      releasePointerCapture: { configurable: true, value: vi.fn() },
      setPointerCapture: { configurable: true, value: vi.fn() },
    });
    act(() => {
      (resizeCallback as ResizeObserverCallback | null)?.([], {} as ResizeObserver);
    });

    act(() => {
      dispatchPointer(handle, 'pointerdown', { clientX: 60, clientY: 60, pointerId: 4 });
      dispatchPointer(handle, 'pointermove', { clientX: 160, clientY: 700, pointerId: 4 });
      dispatchPointer(handle, 'pointerup', { clientX: 160, clientY: 700, pointerId: 4 });
    });

    expect(popover.style.left).toBe('152px');
    expect(popover.style.top).toBe('488px');

    popoverHeight = 500;
    act(() => {
      (resizeCallback as ResizeObserverCallback | null)?.([], {} as ResizeObserver);
    });
    expect(popover.style.top).toBe('288px');
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
