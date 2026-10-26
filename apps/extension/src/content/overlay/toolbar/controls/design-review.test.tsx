// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../design-review/export-menu', () => ({
  AnnotationExportMenu: () => <div data-ui="test.design-review-export" />,
}));

import {
  enableDesignReviewMode,
  disableDesignReviewMode,
  getDesignReviewModeState,
} from '../../../selection/design-review';
import { ToolbarDesignReviewControls } from './design-review';
import type { ToolbarMenuState } from '../state/menu';

let container: HTMLDivElement;
let root: Root;

function createClosedToolbarMenuState(): ToolbarMenuState {
  return {
    activeMenuType: null,
    closeMenu: vi.fn(),
    closeMenus: vi.fn(),
    setActiveMenuType: vi.fn(),
    setShowCaptureMenu: vi.fn(),
    setShowTimerMenu: vi.fn(),
    setViewportMenuOpen: vi.fn(),
    showCaptureMenu: false,
    showTimerMenu: false,
    toggleMenu: vi.fn(),
    viewportMenuOpen: false,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    disableDesignReviewMode();
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

it('renders the active panel toggle beside the Design Review export command', () => {
  const onTogglePanel = vi.fn();
  act(() => {
    root.render(
      <ToolbarDesignReviewControls
        compactMenus={false}
        displayMode="horizontal"
        panelOpen
        toolbarMenuState={createClosedToolbarMenuState()}
        onTogglePanel={onTogglePanel}
      />
    );
  });

  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.design-review-panel-button"]'
  );
  expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  expect(toggle?.getAttribute('title')).toBe('content.designReview.hideFeedbackPanel');
  expect(container.querySelector('[data-ui="content.toolbar.design-review-divider"]')).toBeNull();
  expect(container.querySelector('[data-ui="test.design-review-export"]')).not.toBeNull();

  act(() => toggle?.click());
  expect(onTogglePanel).toHaveBeenCalledOnce();
});

it('toggles rulers through the mode owner and reflects reset on exit', () => {
  act(() => {
    enableDesignReviewMode();
    root.render(
      <ToolbarDesignReviewControls
        compactMenus={false}
        displayMode="vertical"
        panelOpen={false}
        toolbarMenuState={createClosedToolbarMenuState()}
        onTogglePanel={vi.fn()}
      />
    );
  });
  const toggle = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.design-review-measurements-button"]'
  )!;
  const details = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.design-review-measurement-details-button"]'
  )!;
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(details.disabled).toBe(false);
  act(() => toggle.click());
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(toggle.title).toBe('content.designReview.hideDistances');
  expect(getDesignReviewModeState().measurementsEnabled).toBe(true);
  expect(details.disabled).toBe(false);
  act(() => details.click());
  expect(details.getAttribute('aria-pressed')).toBe('true');
  expect(getDesignReviewModeState().measurementsExpanded).toBe(true);
  act(() => toggle.click());
  expect(details.disabled).toBe(false);
  expect(details.getAttribute('aria-pressed')).toBe('true');
  expect(getDesignReviewModeState()).toMatchObject({
    measurementsEnabled: false,
    measurementsExpanded: true,
  });
  act(() => details.click());
  expect(details.getAttribute('aria-pressed')).toBe('false');
  act(() => toggle.click());
  act(() => disableDesignReviewMode());
  expect(toggle.disabled).toBe(true);
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  act(() => toggle.click());
  expect(getDesignReviewModeState().measurementsEnabled).toBe(false);
});

it('exposes independent review tools with exclusive page interaction semantics', () => {
  act(() => {
    enableDesignReviewMode();
    root.render(
      <ToolbarDesignReviewControls
        compactMenus={false}
        displayMode="horizontal"
        panelOpen={false}
        toolbarMenuState={createClosedToolbarMenuState()}
        onTogglePanel={vi.fn()}
      />
    );
  });
  for (const tool of ['inspect', 'compare', 'move', 'comment']) {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-ui="content.toolbar.review-tool.${tool}"]`
    );
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(getDesignReviewModeState()).toMatchObject({ tool });
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(
      container.querySelectorAll('[data-ui^="content.toolbar.review-tool."][aria-pressed="true"]')
    ).toHaveLength(1);
  }
});

it('opens Check without changing the selected page tool', () => {
  act(() => {
    enableDesignReviewMode();
    root.render(
      <ToolbarDesignReviewControls
        compactMenus={false}
        displayMode="horizontal"
        panelOpen={false}
        toolbarMenuState={createClosedToolbarMenuState()}
        onTogglePanel={vi.fn()}
      />
    );
  });
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.review-tool.compare"]')!
      .click()
  );
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.review-check"]')!.click()
  );
  expect(getDesignReviewModeState()).toMatchObject({ tool: 'compare', checkOpen: true });
  expect(
    container
      .querySelector('[data-ui="content.toolbar.review-tool.compare"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
});
