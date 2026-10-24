// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolbarShellContent } from './view';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { useContext } from 'react';
import { installContentUiActivationBridge } from '../../../runtime/ui-activation-bridge';
import type { VideoRecordingToolbarState } from '../../video-recording/session/state';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const recordingPreferences = vi.hoisted(() => ({ ready: true, fadeDuringRecording: true }));

vi.mock('../state/recording-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state/recording-controls')>()),
  useRecordingToolbarControls: (_enabled: boolean, active: boolean) => ({
    active,
    controls: {},
    editing: false,
    error: null,
    pending: false,
    ready: recordingPreferences.ready,
    fadeDuringRecording: recordingPreferences.fadeDuringRecording,
    reload: vi.fn(),
    setVisible: vi.fn(),
    setFadeDuringRecording: vi.fn(),
    toggleEditing: vi.fn(),
  }),
}));

afterEach(() => {
  recordingPreferences.ready = true;
  recordingPreferences.fadeDuringRecording = true;
});

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedPointerEvent: vi.fn(() => true),
}));

const { useContentUiScaleMock, commandMocks } = vi.hoisted(() => ({
  commandMocks: { enabled: false, activate: vi.fn() },
  useContentUiScaleMock: vi.fn(() => 1),
}));

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  useContentUiScale: useContentUiScaleMock,
}));

vi.mock('../controls/primary', () => ({
  ToolbarPrimaryControls: () => {
    const [open, setOpen] = useState(false);
    return (
      <div data-testid="toolbar-primary" data-command-scope={String(useContext(CommandPressScope))}>
        {commandMocks.enabled ? (
          <ContentToolbarButton
            tone="property"
            data-testid="scoped-command"
            aria-expanded={open}
            onClick={() => {
              commandMocks.activate();
              setOpen(!open);
            }}
          >
            Open
          </ContentToolbarButton>
        ) : null}
      </div>
    );
  },
}));

vi.mock('../controls/secondary', () => ({
  ToolbarSecondaryControls: () => <div data-testid="toolbar-secondary" />,
  shouldProjectVideoRecordingControls: vi.fn(),
}));

function renderToolbarShell(
  positionReady: boolean,
  activeMenuType: string | null = null,
  uiScale = 1,
  docking?: {
    isDragging: boolean;
    freePlacement: boolean;
    dockPreview: 'top' | 'bottom' | 'left' | 'right' | null;
  },
  videoRecordingMode = false,
  phase: VideoRecordingToolbarState['phase'] = 'idle'
) {
  useContentUiScaleMock.mockReturnValue(uiScale);
  return renderToStaticMarkup(
    <ToolbarShellContent
      toolbarProps={{ videoRecordingMode, videoRecording: { state: { phase } } } as never}
      viewModel={
        {
          derivedState: {
            toolbarRef: { current: null },
            isDragging: false,
            ...docking,
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

describe('ToolbarShellContent recording crop', () => {
  it('keeps the toolbar visible when its client bounds are wholly outside the actual crop', () => {
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(24, 12, 400, 48));
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <ToolbarShellContent
            toolbarProps={
              {
                videoRecordingMode: true,
                videoRecording: {
                  state: {
                    phase: 'recording',
                    captureMode: CaptureMode.TAB_CROP,
                    cropRegion: { x: 100, y: 100, width: 500, height: 300 },
                  },
                },
              } as never
            }
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
        )
      );
      expect(
        container
          .querySelector('[data-ui="content.toolbar.root"]')
          ?.hasAttribute('data-recording-fade')
      ).toBe(false);
    } finally {
      act(() => root.unmount());
      bounds.mockRestore();
    }
  });

  it('tracks actual scaled placement and recording authority rather than the local target choice', () => {
    let clientBounds = new DOMRect(180, 120, 80, 40);
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => clientBounds);
    useContentUiScaleMock.mockReturnValue(2);
    const container = document.createElement('div');
    const root = createRoot(container);
    const toolbarRef = { current: null };
    const render = (
      captureMode: CaptureMode,
      localTarget: 'TAB' | 'TAB_CROP',
      menuOpen = false
    ) => {
      act(() =>
        root.render(
          <ToolbarShellContent
            toolbarProps={
              {
                videoRecordingMode: true,
                videoRecording: {
                  captureMode: localTarget,
                  state: {
                    phase: 'recording',
                    captureMode,
                    cropRegion: { x: 200, y: 100, width: 200, height: 200 },
                  },
                },
              } as never
            }
            viewModel={
              {
                derivedState: {
                  toolbarRef,
                  isDragging: false,
                  displayMode: 'horizontal',
                  position: { x: clientBounds.x / 2, y: clientBounds.y / 2 },
                  positionReady: true,
                  handleMouseDown: vi.fn(),
                },
                toolbarMenuState: { activeMenuType: menuOpen ? 'settings' : null },
              } as never
            }
            onHoverCapture={vi.fn()}
            onViewportChange={vi.fn()}
          />
        )
      );
    };
    const toolbar = () => container.querySelector('[data-ui="content.toolbar.root"]');
    try {
      render(CaptureMode.TAB_CROP, 'TAB');
      expect(toolbar()?.getAttribute('data-recording-fade')).toBe('true');
      // A committed drag moves the measured, already-scaled shell beyond the crop edge.
      clientBounds = new DOMRect(450, 120, 80, 40);
      render(CaptureMode.TAB_CROP, 'TAB');
      expect(toolbar()?.hasAttribute('data-recording-fade')).toBe(false);
      render(CaptureMode.TAB, 'TAB_CROP');
      expect(toolbar()?.getAttribute('data-recording-fade')).toBe('true');
      clientBounds = new DOMRect(180, 120, 80, 40);
      render(CaptureMode.TAB_CROP, 'TAB', true);
      expect(toolbar()?.getAttribute('data-recording-fade')).toBe('true');
      expect(toolbar()?.getAttribute('data-menu-open')).toBe('true');
    } finally {
      act(() => root.unmount());
      bounds.mockRestore();
      useContentUiScaleMock.mockReturnValue(1);
    }
  });
});

describe('ToolbarShellContent', () => {
  it.each(['idle', 'starting', 'recording', 'paused', 'stopping', 'error'] as const)(
    'admits automatic fading only in the recording phase, phase=%s',
    (phase) => {
      const markup = renderToolbarShell(true, null, 1, undefined, true, phase);
      expect(markup.includes('data-recording-fade="true"')).toBe(phase === 'recording');
    }
  );

  it.each([
    { mode: false, ready: true, enabled: true },
    { mode: true, ready: false, enabled: true },
    { mode: true, ready: true, enabled: false },
  ])(
    'keeps non-recording, unavailable and disabled preferences visible: $mode/$ready/$enabled',
    (state) => {
      recordingPreferences.ready = state.ready;
      recordingPreferences.fadeDuringRecording = state.enabled;
      expect(renderToolbarShell(true, null, 1, undefined, state.mode, 'recording')).not.toContain(
        'data-recording-fade="true"'
      );
    }
  );
  it.each([false, true])('adopts ordinary chrome in recording mode=%s', (recording) => {
    const container = document.createElement('div');
    container.innerHTML = renderToolbarShell(true, null, 1, undefined, recording);
    const toolbar = container.querySelector('[data-ui="content.toolbar.root"]');
    expect(toolbar?.classList.contains('sniptale-content-toolbar-adopted')).toBe(true);
    expect(
      container.querySelector('[data-testid="toolbar-primary"]')?.getAttribute('data-command-scope')
    ).toBe('true');
  });

  it.each([false, true])('keeps pointer focus cleared with activation bridge=%s', (bridged) => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.append(container);
    const root = createRoot(container);
    const disposeBridge = bridged ? installContentUiActivationBridge(shadow) : () => {};
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
      expect(shadow.activeElement).toBe(button);
      if (!bridged) {
        act(() =>
          icon.dispatchEvent(
            new MouseEvent('pointerdown', {
              bubbles: true,
              cancelable: true,
              composed: true,
              button: 0,
            })
          )
        );
      }
      const press = new MouseEvent(bridged ? 'pointerdown' : 'mousedown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
      });
      act(() => icon.dispatchEvent(press));
      expect(shadow.activeElement).not.toBe(button);
      if (!bridged) {
        expect(press.defaultPrevented).toBe(true);
        act(() => button.click());
      }
    }
    expect(click).toHaveBeenCalledTimes(6);

    const input = document.createElement('input');
    toolbar?.append(input);
    input.focus();
    act(() => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    expect(shadow.activeElement).toBe(input);

    const button = toolbar?.querySelector<HTMLButtonElement>('button');
    button?.focus();
    act(() => button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 })));
    expect(shadow.activeElement).toBe(button);

    // Keyboard activation has no mousedown and must retain the focused button.
    act(() => button?.click());
    expect(shadow.activeElement).toBe(button);
    expect(click).toHaveBeenCalledTimes(7);

    disposeBridge();
    act(() => root.unmount());
    host.remove();
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

it.each(['top', 'bottom', 'left', 'right', null] as const)(
  'shows eight pointer-transparent guides and the %s preview during docking',
  (dockPreview) => {
    const markup = renderToolbarShell(true, null, 0.5, {
      isDragging: true,
      freePlacement: false,
      dockPreview,
    });
    const dom = new DOMParser().parseFromString(markup, 'text/html');
    const guides = dom.querySelector<HTMLElement>('[data-ui="content.toolbar.dock-guides"]')!;
    expect(guides.style.pointerEvents).toBe('none');
    expect(guides.children).toHaveLength(8);
    expect(guides.querySelectorAll('[data-active="true"]')).toHaveLength(dockPreview ? 1 : 0);
    expect(
      guides.querySelector<HTMLElement>('[data-ui="content.toolbar.dock-zone.top"]')?.style.height
    ).toBe('32px');
    expect(
      renderToolbarShell(true, null, 1, {
        isDragging: true,
        freePlacement: true,
        dockPreview: null,
      })
    ).not.toContain('content.toolbar.dock-guides');
    expect(renderToolbarShell(true)).not.toContain('content.toolbar.dock-guides');
  }
);

it.each([false, true])(
  'preserves a focused command activation after pointer blur, recording=%s',
  (recording) => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const root = createRoot(shadow);
    commandMocks.enabled = true;
    commandMocks.activate.mockClear();
    try {
      act(() =>
        root.render(
          <ToolbarShellContent
            toolbarProps={{ videoRecordingMode: recording } as never}
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
        )
      );
      const button = shadow.querySelector<HTMLButtonElement>('[data-testid="scoped-command"]')!;
      act(() => button.focus());
      expect(shadow.activeElement).toBe(button);
      const dispatch = (type: string, buttons: number, detail = 0) => {
        const event = new MouseEvent(type, {
          bubbles: true,
          composed: true,
          cancelable: true,
          button: 0,
          buttons,
          detail,
        });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        act(() => button.dispatchEvent(event));
        return event;
      };
      const down = dispatch('pointerdown', 1);
      const focusedAfterPointer = shadow.activeElement === button;
      const mouseDown = dispatch('mousedown', 1);
      dispatch('pointerup', 0);
      dispatch('click', 0, 1);
      expect(commandMocks.activate).toHaveBeenCalledOnce();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(down.defaultPrevented).toBe(false);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(focusedAfterPointer).toBe(false);
      expect(shadow.activeElement).not.toBe(button);
      expect(button.getAttribute('data-pressing')).not.toBe('true');
      // A keyboard activation keeps its deliberate focus and invokes the same command.
      act(() => {
        button.focus();
        button.click();
      });
      expect(shadow.activeElement).toBe(button);
      expect(commandMocks.activate).toHaveBeenCalledTimes(2);
      expect(button.getAttribute('aria-expanded')).toBe('false');
    } finally {
      act(() => root.unmount());
      host.remove();
      commandMocks.enabled = false;
    }
  }
);
