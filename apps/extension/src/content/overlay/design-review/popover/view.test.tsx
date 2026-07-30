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
    expect(popover.querySelector<HTMLElement>('.overflow-y-auto')?.style.maxHeight).toBe('126px');

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
    popoverHeight = 360;
    act(() => actionButton.click());
    act(() => {
      (resizeCallback as ResizeObserverCallback)([], {} as ResizeObserver);
    });
    const actionMenu = container.querySelector<HTMLElement>(
      '[data-ui="content.design-review.action-menu"]'
    );
    expect(actionMenu).not.toBeNull();
    expect(actionMenu?.className).not.toContain('absolute');
    expect(actionMenu?.closest('.overflow-y-auto')).not.toBeNull();
    expect(popover.style.top).toBe('12px');
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
