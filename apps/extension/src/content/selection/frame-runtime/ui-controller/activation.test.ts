// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const highlighterState = vi.hoisted(() => ({ enabled: true, paused: false }));

vi.mock('../../highlighter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../highlighter')>();
  return {
    ...actual,
    isHighlighterEnabled: () => highlighterState.enabled,
    isHighlighterPausedState: () => highlighterState.paused,
    pauseHighlighter: () => {
      highlighterState.paused = true;
    },
    resumeHighlighter: () => {
      highlighterState.paused = false;
    },
  };
});

import { createFrameSelectionEventHandlers } from './activation';
import { pauseHighlighter, resumeHighlighter } from '../../highlighter';

function frame(): FrameData {
  return { effectMode: 'border', height: 100, id: 'frame-1', width: 180, x: 100, y: 100 };
}

function createHandlers(
  selectedFrameId: string | null = null,
  activePopover: {
    frameId: string;
    kind: 'frame-settings' | 'step-badge' | 'callout-settings';
  } | null = null,
  consumeSuppressedClick = vi.fn(() => false),
  frames: FrameData[] = [frame()]
) {
  const actions = {
    clearSelection: vi.fn(),
    hoverFrame: vi.fn(),
    selectFrame: vi.fn(),
  };
  return {
    actions,
    handlers: createFrameSelectionEventHandlers({
      framesRef: { current: frames },
      hoveredFrameIdRef: { current: null },
      activePopoverRef: { current: activePopover },
      selectedFrameIdRef: { current: selectedFrameId },
      consumeSuppressedClick,
      ...actions,
    }),
  };
}

afterEach(() => {
  highlighterState.enabled = true;
  resumeHighlighter();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('frame selection events', () => {
  it('consumes a click on a concrete frame border without opening the toolbar', () => {
    const { actions, handlers } = createHandlers();
    const event = new MouseEvent('click', {
      cancelable: true,
      clientX: 101,
      clientY: 150,
    });

    handlers.click(event);

    expect(actions.selectFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('selects and consumes a simple primary click in the frame interior', () => {
    const { actions, handlers } = createHandlers();
    const event = new MouseEvent('click', {
      button: 0,
      cancelable: true,
      clientX: 190,
      clientY: 150,
    });

    handlers.click(event);

    expect(actions.selectFrame).toHaveBeenCalledWith('frame-1', { x: 90, y: 50 });
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    { area: 'border', clientX: 101, clientY: 150 },
    { area: 'interior', clientX: 190, clientY: 150 },
  ])('lets a primary click in the frame $area pass outside highlighter mode', (point) => {
    const { actions, handlers } = createHandlers();
    const event = new MouseEvent('click', {
      button: 0,
      cancelable: true,
      clientX: point.clientX,
      clientY: point.clientY,
    });
    highlighterState.enabled = false;

    handlers.click(event);

    expect(actions.selectFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a secondary click in the frame interior untouched', () => {
    const { actions, handlers } = createHandlers();
    const event = new MouseEvent('click', {
      button: 2,
      cancelable: true,
      clientX: 190,
      clientY: 150,
    });

    handlers.click(event);

    expect(actions.selectFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('lets pending free-draw click suppression win before interior selection', () => {
    const consumeSuppressedClick = vi.fn(() => true);
    const { actions, handlers } = createHandlers(null, null, consumeSuppressedClick);
    const event = new MouseEvent('click', {
      button: 0,
      cancelable: true,
      clientX: 190,
      clientY: 150,
    });

    handlers.click(event);

    expect(consumeSuppressedClick).toHaveBeenCalledWith(event);
    expect(actions.selectFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not activate an underlying nested frame while direct editing owns the visual top', () => {
    const outer = { ...frame(), height: 240, id: 'outer', width: 320 };
    const inner = { ...frame(), height: 80, id: 'inner', width: 100, x: 160, y: 160 };
    const { actions, handlers } = createHandlers(null, null, undefined, [outer, inner]);
    const event = new MouseEvent('click', {
      button: 0,
      cancelable: true,
      clientX: 210,
      clientY: 200,
    });
    pauseHighlighter();

    handlers.click(event);

    expect(actions.selectFrame).not.toHaveBeenCalled();
  });

  it('keeps a persistent selection on pointerdown in frame interior without consuming drawing', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const event = new MouseEvent('pointerdown', {
      cancelable: true,
      clientX: 190,
      clientY: 150,
    });

    handlers.pointerDown(event as PointerEvent);

    expect(actions.clearSelection).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('clears a persistent selection on pointerdown outside every frame', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const event = new MouseEvent('pointerdown', {
      cancelable: true,
      clientX: 20,
      clientY: 20,
    });

    handlers.pointerDown(event as PointerEvent);

    expect(actions.clearSelection).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves native trigger activation to the button owner', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const trigger = document.createElement('button');
    trigger.dataset['frameId'] = 'frame-1';
    trigger.dataset['frameControl'] = 'trigger';
    const event = new MouseEvent('click', { cancelable: true, clientX: 100, clientY: 100 });
    Object.defineProperty(event, 'target', { value: trigger });
    Object.defineProperty(event, 'composedPath', { value: () => [trigger] });

    handlers.click(event);

    expect(actions.selectFrame).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps size-editor pointer and Escape events under the edit interaction owner', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const sizeEditor = document.createElement('div');
    sizeEditor.className = 'sniptale-content-size-tooltip';
    document.body.append(sizeEditor);
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, 'target', { value: sizeEditor });
    Object.defineProperty(pointerDown, 'composedPath', { value: () => [sizeEditor] });

    handlers.pointerDown(pointerDown as PointerEvent);
    const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });
    handlers.keyDown(escape);

    expect(actions.clearSelection).not.toHaveBeenCalled();
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('keeps preset-editor and owned portal pointer events out of frame hit-testing', () => {
    const targets = [
      (() => {
        const editorLayer = document.createElement('div');
        editorLayer.className = 'sniptale-frame-style-editor-layer';
        const editorControl = document.createElement('button');
        editorLayer.append(editorControl);
        document.body.append(editorLayer);
        return { path: [editorControl, editorLayer], target: editorControl };
      })(),
      (() => {
        const floatingLayer = document.createElement('div');
        floatingLayer.setAttribute('data-floating-ui-owned-by', 'frame-style-color');
        document.body.append(floatingLayer);
        return { path: [floatingLayer], target: floatingLayer };
      })(),
    ];

    targets.forEach(({ path, target }) => {
      const { actions, handlers } = createHandlers('frame-1');
      const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      Object.defineProperty(pointerDown, 'target', { value: target });
      Object.defineProperty(pointerDown, 'composedPath', { value: () => path });

      handlers.pointerDown(pointerDown as PointerEvent);

      expect(actions.clearSelection).not.toHaveBeenCalled();
    });
  });

  it('leaves the first Escape to each open popover family without clearing selection', () => {
    const kinds = ['frame-settings', 'step-badge', 'callout-settings'] as const;

    kinds.forEach((kind) => {
      const { actions, handlers } = createHandlers('frame-1', {
        frameId: 'frame-1',
        kind,
      });
      const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' });

      handlers.keyDown(escape);

      expect(actions.clearSelection).not.toHaveBeenCalled();
      expect(escape.defaultPrevented).toBe(false);
    });
  });

  it('closes selection on Escape and restores focus to its hover trigger', () => {
    const { actions, handlers } = createHandlers('frame-1');
    const trigger = document.createElement('button');
    trigger.className = 'sniptale-frame-toolbar-trigger';
    trigger.dataset['frameId'] = 'frame-1';
    document.body.append(trigger);
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    handlers.keyDown(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));

    expect(actions.hoverFrame).toHaveBeenCalledWith('frame-1');
    expect(actions.clearSelection).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });
});
