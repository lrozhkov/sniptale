// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolbarShellContent } from './view';

const { useContentUiScaleMock } = vi.hoisted(() => ({
  useContentUiScaleMock: vi.fn(() => 1),
}));

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  useContentUiScale: useContentUiScaleMock,
}));

vi.mock('../controls/primary', () => ({
  ToolbarPrimaryControls: () => <div data-testid="toolbar-primary" />,
}));

vi.mock('../controls/secondary', () => ({
  ToolbarSecondaryControls: () => <div data-testid="toolbar-secondary" />,
  shouldProjectVideoRecordingControls: vi.fn(),
}));

function renderToolbarShell(
  positionReady: boolean,
  activeMenuType: string | null = null,
  uiScale = 1
) {
  useContentUiScaleMock.mockReturnValue(uiScale);
  return renderToStaticMarkup(
    <ToolbarShellContent
      toolbarProps={{} as never}
      viewModel={
        {
          derivedState: {
            toolbarRef: { current: null },
            isDragging: false,
            displayMode: 'horizontal',
            position: { x: 24, y: 12 },
            positionReady,
            uiScale,
            handleMouseDown: vi.fn(),
          },
          toolbarMenuState: { activeMenuType },
        } as never
      }
      onHoverCapture={vi.fn()}
      onViewportChange={vi.fn()}
    />
  );
}

describe('ToolbarShellContent', () => {
  it('clears keyboard focus before a primary mouse click on toolbar buttons', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ToolbarShellContent
          toolbarProps={{} as never}
          viewModel={
            {
              derivedState: {
                toolbarRef: { current: null },
                isDragging: false,
                displayMode: 'horizontal',
                position: { x: 24, y: 12 },
                positionReady: true,
                handleMouseDown: vi.fn(),
              },
              toolbarMenuState: { activeMenuType: null },
            } as never
          }
          onHoverCapture={vi.fn()}
          onViewportChange={vi.fn()}
        />
      );
    });

    const toolbar = container.querySelector('[data-ui="content.toolbar.root"]');
    const click = vi.fn();
    for (const id of [
      'settings-button',
      'timer-button',
      'viewport-button',
      'capture-action-button',
      'mode-selector-button',
      'page-editing-mode.direct-text',
    ]) {
      const button = document.createElement('button');
      button.className = 'sniptale-btn';
      button.dataset['ui'] = `content.toolbar.${id}`;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      button.append(icon);
      button.addEventListener('click', click);
      toolbar?.append(button);
      button.focus();
      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
      act(() => icon.dispatchEvent(press));
      expect(document.activeElement).not.toBe(button);
      expect(press.defaultPrevented).toBe(false);
      act(() => button.click());
    }
    expect(click).toHaveBeenCalledTimes(6);

    const input = document.createElement('input');
    toolbar?.append(input);
    input.focus();
    act(() => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    expect(document.activeElement).toBe(input);

    const button = toolbar?.querySelector<HTMLButtonElement>('button');
    button?.focus();
    act(() => button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 })));
    expect(document.activeElement).toBe(button);

    act(() => root.unmount());
    container.remove();
  });

  it('starts toolbar dragging from pointerdown', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const handleMouseDown = vi.fn();

    act(() => {
      root.render(
        <ToolbarShellContent
          toolbarProps={{} as never}
          viewModel={
            {
              derivedState: {
                toolbarRef: { current: null },
                isDragging: false,
                displayMode: 'horizontal',
                position: { x: 24, y: 12 },
                positionReady: true,
                handleMouseDown,
              },
              toolbarMenuState: { activeMenuType: null },
            } as never
          }
          onHoverCapture={vi.fn()}
          onViewportChange={vi.fn()}
        />
      );
    });

    act(() => {
      container
        .querySelector('[data-ui="shared.ui.content-toolbar-drag-handle"]')
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });

    expect(handleMouseDown).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('keeps the shell hidden until the drag-position owner reports readiness', () => {
    const markup = renderToolbarShell(false);

    expect(markup).toContain('visibility:hidden');
    expect(markup).toContain('pointer-events:none');
    expect(markup).toContain('animation:none');
  });

  it('renders the positioned shell once the drag-position owner is ready', () => {
    const markup = renderToolbarShell(true);

    expect(markup).toContain('top:12px');
    expect(markup).toContain('left:24px');
    expect(markup).toContain('visibility:visible');
    expect(markup).toContain('pointer-events:auto');
  });

  it('projects logical toolbar coordinates back into the scaled client surface', () => {
    const markup = renderToolbarShell(true, null, 4);

    expect(markup).toContain('sniptale-toolbar-positioner');
    expect(markup).toContain('sniptale-content-ui-zoom-surface');
    expect(markup).toContain('top:48px');
    expect(markup).toContain('left:96px');
    expect(markup).toContain('position:fixed');
  });

  it('owns a viewport interaction guard while a main-toolbar menu is open', () => {
    const markup = renderToolbarShell(true, 'frame-style');

    expect(markup).toContain('sniptale-toolbar-menu-interaction-guard');
    expect(markup).toContain('data-menu-open="true"');
  });
});
