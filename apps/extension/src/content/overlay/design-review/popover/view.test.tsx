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
  voice: { start: vi.fn(), stop: vi.fn() },
};

const element = document.createElement('h1');
const state: DesignReviewViewState = {
  action: 'refine',
  anchor: { x: 40, y: 40 },
  comment: { commitFailed: false, draft: '', marker: 1 },
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
  voice: {
    active: false,
    audioLevel: 0,
    caretPosition: null,
    errorCode: null,
    phase: 'idle',
  },
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
  const root = document.createElement('div');
  root.innerHTML = markup;

  expect(markup).toContain('content.design-review.popover');
  expect(markup).toContain('Что нужно изменить или проверить?');
  expect(markup).toContain('Доработать');
  expect(markup).toContain('html &gt; body &gt; main &gt; h1:nth-of-type(1)');
  expect(markup).toContain('compact-settings');
  expect(markup).not.toContain('input type="file"');
  expect(markup).not.toContain('Enter — готово');
  expect(
    root.querySelector('[data-ui="content.design-review.comment-footer"]')?.className
  ).not.toContain('border-t');
  expect(
    root.querySelector('[data-ui="content.design-review.comment-submit-hint"]')
  ).not.toBeNull();
  expect(root.querySelector('button[aria-label="Изменить свойства элемента"]')).toBeNull();
  for (const label of ['Копировать данные элемента', 'Удалить замечание']) {
    expect(root.querySelector(`button[aria-label="${label}"]`)?.className).toContain(
      'cursor-pointer'
    );
  }
  expect(root.querySelector('[data-ui="content.design-review.popover"]')?.className).toContain(
    'cursor-default'
  );
  const commentField = root.querySelector(
    '[data-ui="content.design-review.comment"] textarea'
  )?.parentElement;
  expect(commentField?.className).toContain('border-[color:var(--sniptale-color-border-soft)]');
  expect(commentField?.className).toContain('focus-within:ring-1');
  expect(commentField?.className).not.toContain('focus-within:ring-2');
  const copyButton = root.querySelector('button[aria-label="Копировать данные элемента"]');
  expect(copyButton?.className).toContain('focus-visible:ring-2');
  expect(copyButton?.className).toContain('hover:bg-');
  expect(copyButton?.className).toContain('active:bg-');
  const deleteButton = root.querySelector('button[aria-label="Удалить замечание"]');
  expect(deleteButton?.className).toContain('text-[var(--sniptale-color-danger)]');
  expect(deleteButton?.className).toContain('ml-1');
  const closeButton = root.querySelector('button[aria-label="Закрыть"]');
  expect(closeButton?.className).toContain('pointer-events-auto');
  expect(closeButton?.className).toContain('cursor-pointer');
  expect(closeButton?.className).toContain('z-50');
});

it('uses native non-layout hints for the element tag and full path', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <DesignReviewPopover actions={actions} open={true} state={state} />
  );

  expect(
    root.querySelector('[data-ui="content.design-review.element-selector"]')?.textContent
  ).toBe('h1:nth-of-type(1)');
  expect(
    root
      .querySelector('[data-ui="content.design-review.element-selector"]')
      ?.closest('button')
      ?.getAttribute('title')
  ).toBe('html > body > main > h1:nth-of-type(1)');
  expect(
    root.querySelector('[data-ui="content.design-review.element-tag"]')?.getAttribute('title')
  ).toBe('<h1> — заголовок');
  expect(root.querySelector('[role="tooltip"]')).toBeNull();
});

it('does not render without an active click selection', () => {
  expect(
    renderToStaticMarkup(<DesignReviewPopover actions={actions} open={false} state={state} />)
  ).toBe('');
});

it('shows edit and delete in separate popover states', () => {
  for (const settingsOpen of [false, true]) {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      <DesignReviewPopover actions={actions} open state={{ ...state, settingsOpen }} />
    );
    expect(Boolean(root.querySelector('[aria-label="Изменить свойства элемента"]'))).toBe(
      !settingsOpen
    );
    expect(Boolean(root.querySelector('[aria-label="Удалить замечание"]'))).toBe(settingsOpen);
  }
});

it('hides delete when the selected element has no saved feedback', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <DesignReviewPopover
      actions={actions}
      open
      state={{ ...state, comment: { ...state.comment, marker: null } }}
    />
  );
  expect(root.querySelector('[aria-label="Удалить замечание"]')).toBeNull();
});

it('shows five compact action choices with only the selected label and colored icon', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <DesignReviewPopover actions={actions} open state={state} />
  );
  const choices = root.querySelectorAll<HTMLButtonElement>(
    '[data-ui="content.design-review.action-switch"] button'
  );
  expect(choices).toHaveLength(5);
  expect(
    [...choices].filter((button) => button.getAttribute('aria-pressed') === 'true')
  ).toHaveLength(1);
  expect(choices[0]?.textContent).toContain('Доработать');
  expect(choices[1]?.textContent).toBe('');
  expect(choices[1]?.getAttribute('title')).toBe('Исправить');
  expect(choices[0]?.querySelector('svg')?.getAttribute('class')).toContain('text-[#8b5cf6]');
  expect(choices[1]?.querySelector('svg')?.getAttribute('class')).not.toContain(
    'text-[var(--sniptale-color-danger)]'
  );
});

it('keeps only the selected action icon colored and label visible', () => {
  for (const action of ['refine', 'fix', 'simplify', 'verify', 'explain'] as const) {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      <DesignReviewPopover actions={actions} open state={{ ...state, action }} />
    );
    const selected = root.querySelector<HTMLButtonElement>(
      '[data-ui="content.design-review.action-switch"] button[aria-pressed="true"]'
    );
    expect(selected?.textContent?.length).toBeGreaterThan(0);
    expect(selected?.querySelector('svg')?.getAttribute('class')).toContain('text-[');
    const unselected = root.querySelectorAll<HTMLButtonElement>(
      '[data-ui="content.design-review.action-switch"] button[aria-pressed="false"]'
    );
    expect(unselected).toHaveLength(4);
    expect([...unselected].every((button) => button.textContent === '')).toBe(true);
    expect(
      [...unselected].every(
        (button) => !button.querySelector('svg')?.getAttribute('class')?.includes('text-[')
      )
    ).toBe(true);
  }
});

it('keeps the compact switch interactive across the content shadow boundary', () => {
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
          open
          state={{ ...state, settingsOpen: false }}
        />
      );
    });
    const fix = shadowRoot.querySelector<HTMLButtonElement>(
      '[data-ui="content.design-review.action-switch"] button[aria-label="Исправить"]'
    );
    if (!fix) throw new Error('Expected Fix action');
    expect(fix.getAttribute('title')).toBe('Исправить');
    expect(fix.className).toContain('focus-visible:ring-2');
    act(() => fix.click());
    expect(selectAction).toHaveBeenCalledWith('fix');
    expect(
      shadowRoot.querySelectorAll('[data-ui="content.design-review.action-switch"] button')
    ).toHaveLength(5);
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
    const actionSwitch = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.action-switch"]'
    );
    expect(actionSwitch?.closest('[data-ui="content.design-review.comment"]')).not.toBeNull();
    expect(actionSwitch?.querySelectorAll('button')).toHaveLength(5);
    act(() => {
      (resizeCallback as ResizeObserverCallback)([], {} as ResizeObserver);
    });
    expect(popover.style.top).toBe('12px');
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

it('moves from the popover header and stays clamped to the viewport', () => {
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
    expect(handle.closest('[data-ui="content.design-review.comment-layer"]')).not.toBeNull();
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

it('collapses delete confirmation when the same selection is reopened', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(<DesignReviewPopover actions={actions} open={true} state={state} />);
    });
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить замечание"]'
    );
    if (!deleteButton) throw new Error('Expected delete action');
    act(() => deleteButton.click());
    expect(
      container.querySelector('[data-ui="content.design-review.delete-confirmation"]')
    ).not.toBeNull();

    act(() => {
      root.render(<DesignReviewPopover actions={actions} open={false} state={state} />);
    });
    act(() => {
      root.render(<DesignReviewPopover actions={actions} open={true} state={state} />);
    });

    expect(
      container.querySelector('[data-ui="content.design-review.delete-confirmation"]')
    ).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
