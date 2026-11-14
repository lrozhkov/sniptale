// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession, resolveDrawingToolCursor } from '../../features/drawing/public';
import type { DrawingDocumentCommit, DrawingTool } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface, getDrawingViewportProjection, toDrawingScenePoint } from './surface';

const domHostMocks = vi.hoisted(() => ({ toggleContentHostClass: vi.fn() }));

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: domHostMocks.toggleContentHostClass,
}));

function createCanvasContextFixture(): CanvasRenderingContext2D {
  const context: Partial<CanvasRenderingContext2D> = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 }) as TextMetrics),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn(),
  };
  return context as CanvasRenderingContext2D;
}

const context = createCanvasContextFixture();

it.each(['select', 'arrow'] as const)(
  'removes a selected arrow bend once on a real double-click sequence in %s',
  (tool) => {
    const commits: DrawingDocumentCommit[] = [];
    const session = createDrawingSession({
      onDocumentCommit: (commit) => {
        commits.push(commit);
        return true;
      },
    });
    const original = {
      id: 'double-click-arrow',
      kind: 'arrow' as const,
      design: 'freehand' as const,
      dynamicWidth: false,
      start: { x: 40, y: 80 },
      end: { x: 240, y: 80 },
      bendPoints: [{ x: 140, y: 140 }],
      color: '#ef4444',
      width: 4,
    };
    session.commitObject(original);
    session.setActiveTool(tool);
    session.select(original.id);
    const controller: ContentDrawingController = {
      session,
      getPalette: () => [],
      applyPalette: vi.fn(),
      getScrollRoot: () => ({ kind: 'viewport', element: null }),
      prepareActivation: () => true,
      registerInteractionFinalizer: vi.fn(),
      finalizeInteraction: vi.fn(),
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
    const canvas = host.querySelector('canvas')!;
    commits.length = 0;
    try {
      for (const detail of [1, 2]) {
        for (const type of ['pointerdown', 'pointerup', 'click']) {
          const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 152,
            clientY: 140,
            button: 0,
            detail,
          });
          Object.defineProperties(event, {
            pointerId: { value: 1 },
            pointerType: { value: 'mouse' },
          });
          act(() => canvas.dispatchEvent(event));
        }
      }
      act(() =>
        canvas.dispatchEvent(
          new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            clientX: 152,
            clientY: 140,
            detail: 2,
          })
        )
      );
      expect(commits).toHaveLength(1);
      const removed = { ...original, bendPoints: [] };
      expect(session.getSnapshot().document.objects).toEqual([removed]);
      expect(session.getSnapshot().selectedObjectId).toBe(original.id);
      act(() => commits[0]!.replay(commits[0]!.before));
      expect(session.getSnapshot().document.objects).toEqual([original]);
      act(() => commits[0]!.replay(commits[0]!.after));
      expect(session.getSnapshot().document.objects).toEqual([removed]);
      expect(commits).toHaveLength(1);
      act(() => session.select(original.id));
      for (const point of [original.start, original.end, { x: 140, y: 80 }]) {
        act(() =>
          canvas.dispatchEvent(
            new MouseEvent('dblclick', {
              bubbles: true,
              clientX: point.x,
              clientY: point.y,
              detail: 2,
            })
          )
        );
      }
      expect(commits).toHaveLength(1);
      expect(session.getSnapshot().selectedObjectId).toBe(original.id);
    } finally {
      act(() => root.unmount());
    }
  }
);

it.each([
  { active: false, suppressed: false, tool: 'select', liveDraft: false },
  { active: true, suppressed: true, tool: 'select', liveDraft: false },
  { active: true, suppressed: false, tool: 'pencil', liveDraft: false },
  { active: true, suppressed: false, tool: 'select', liveDraft: true },
] satisfies Array<{ active: boolean; suppressed: boolean; tool: DrawingTool; liveDraft: boolean }>)(
  'does not remove an unavailable arrow point: %j',
  ({ active, suppressed, tool, liveDraft }) => {
    const commit = vi.fn(() => true);
    const session = createDrawingSession({ onDocumentCommit: commit });
    session.commitObject({
      id: 'guarded-arrow',
      kind: 'arrow',
      design: 'freehand',
      dynamicWidth: false,
      color: '#ef4444',
      width: 4,
      start: { x: 40, y: 80 },
      end: { x: 240, y: 80 },
      bendPoints: [{ x: 140, y: 140 }],
    });
    session.setActiveTool(tool);
    session.select('guarded-arrow');
    const before = session.getCommittedDocument();
    const controller: ContentDrawingController = {
      session,
      getPalette: () => [],
      applyPalette: vi.fn(),
      getScrollRoot: () => ({ kind: 'viewport', element: null }),
      prepareActivation: () => true,
      registerInteractionFinalizer: vi.fn(),
      finalizeInteraction: vi.fn(),
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <DrawingSurface
          active={active}
          chromeHidden={false}
          serviceUiSuppressed={suppressed}
          controller={controller}
        />
      )
    );
    commit.mockClear();
    if (liveDraft) {
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 140,
        clientY: 140,
        button: 0,
      });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
      act(() => host.querySelector('canvas')!.dispatchEvent(event));
    }
    act(() =>
      host.querySelector('canvas')!.dispatchEvent(
        new MouseEvent('dblclick', {
          bubbles: true,
          clientX: 140,
          clientY: 140,
          detail: 2,
        })
      )
    );
    expect(session.getCommittedDocument()).toBe(before);
    expect(commit).not.toHaveBeenCalled();
    act(() => root.unmount());
  }
);

function inputText(editor: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(editor, value);
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'object-id') });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 800 },
    innerHeight: { configurable: true, value: 600 },
    devicePixelRatio: { configurable: true, value: 2 },
  });
});

it('renders every unified outline shape and only fills the configured shape', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const shapes = ['rectangle', 'ellipse', 'triangle', 'parallelogram'] as const;
  shapes.forEach((kind) =>
    session.commitObject({
      bounds: { x: 10, y: 20, width: 80, height: 40 },
      color: '#ef4444',
      fillColor: kind === 'ellipse' ? '#12345680' : null,
      id: kind,
      kind,
      width: 4,
    })
  );
  session.setActiveTool('shape');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));

  expect(context.stroke).toHaveBeenCalledTimes(4);
  expect(context.ellipse).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledTimes(3);
  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.fillStyle).toBe('#12345680');
  act(() => root.unmount());
});

it('renders an arrow as the filled editor-style shaft and head profile', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    color: '#ef4444',
    dynamicWidth: true,
    end: { x: 200, y: 40 },
    id: 'arrow',
    kind: 'arrow',
    start: { x: 20, y: 40 },
    width: 18,
  });
  session.setActiveTool('arrow');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));

  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledOnce();
  expect(context.lineTo).toHaveBeenCalledTimes(6);
  expect(context.stroke).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('renders a freehand arrow as a deterministic rough open stroke instead of a filled profile', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    color: '#ef4444',
    design: 'freehand',
    dynamicWidth: true,
    end: { x: 200, y: 40 },
    id: 'freehand-arrow',
    kind: 'arrow',
    start: { x: 20, y: 40 },
    width: 18,
  });
  session.setActiveTool('arrow');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));

  expect(context.stroke).toHaveBeenCalled();
  expect(context.bezierCurveTo).toHaveBeenCalled();
  expect(context.fill).not.toHaveBeenCalled();
  expect(context.lineCap).toBe('round');
  expect(context.lineJoin).toBe('round');
  act(() => root.unmount());
});

it('shows only two endpoint handles without a dashed selection box for an arrow', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    color: '#ef4444',
    dynamicWidth: true,
    end: { x: 200, y: 40 },
    id: 'selected-arrow',
    kind: 'arrow',
    start: { x: 20, y: 40 },
    width: 18,
  });
  session.setActiveTool('select');
  session.select('selected-arrow');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));

  const canvas = host.querySelector<HTMLCanvasElement>('canvas');
  expect(canvas?.style.cursor).toBe('default');
  expect(context.arc).toHaveBeenCalledTimes(2);
  expect(context.strokeRect).not.toHaveBeenCalled();
  act(() => {
    canvas?.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 40 })
    );
  });
  expect(canvas?.style.cursor).toBe('grab');
  const endpointEvent = (type: string) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 40,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
    });
    return event;
  };
  act(() => canvas?.dispatchEvent(endpointEvent('pointerdown')));
  expect(canvas?.style.cursor).toBe('grabbing');
  act(() => canvas?.dispatchEvent(endpointEvent('pointerup')));
  expect(canvas?.style.cursor).toBe('grab');
  act(() => {
    canvas?.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 })
    );
  });
  expect(canvas?.style.cursor).toBe('default');
  act(() => root.unmount());
});

it.each([
  [{ x: 20, y: 30 }, 'nwse-resize'],
  [{ x: 70, y: 30 }, 'ns-resize'],
  [{ x: 120, y: 30 }, 'nesw-resize'],
  [{ x: 120, y: 70 }, 'ew-resize'],
  [{ x: 120, y: 110 }, 'nwse-resize'],
  [{ x: 70, y: 110 }, 'ns-resize'],
  [{ x: 20, y: 110 }, 'nesw-resize'],
  [{ x: 20, y: 70 }, 'ew-resize'],
] as const)('shows the canonical directional cursor for a box handle', (point, cursor) => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    bounds: { x: 20, y: 30, width: 100, height: 80 },
    color: '#ef4444',
    id: 'selected-rectangle',
    kind: 'rectangle',
    width: 4,
  });
  session.setActiveTool('select');
  session.select('selected-rectangle');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;

  act(() => {
    canvas.dispatchEvent(
      new MouseEvent('pointermove', {
        bubbles: true,
        clientX: point.x,
        clientY: point.y,
      })
    );
  });

  expect(canvas.style.cursor).toBe(cursor);
  act(() => root.unmount());
});

it('commits a text draft on Enter, an outside click, and a tool change', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.setActiveTool('text');
  let finalizer: (() => void) | null = null;
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: (next) => {
      finalizer = next;
    },
    finalizeInteraction: () => finalizer?.(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  const beginText = (x: number, y: number) => {
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
      );
    });
    return host.querySelector<HTMLTextAreaElement>('[data-ui="content.drawing.text-input"]')!;
  };
  const enterText = (editor: HTMLTextAreaElement, value: string) => {
    act(() => {
      inputText(editor, value);
    });
  };

  const enterEditor = beginText(20, 30);
  expect(enterEditor).not.toBeNull();
  expect(enterEditor.style.border).toBe('0px');
  expect(enterEditor.style.overflow).not.toBe('auto');
  enterText(enterEditor, 'Enter commit');
  const editorShell = enterEditor.closest<HTMLElement>('[data-ui="content.drawing.text-editor"]');
  expect(enterEditor.style.padding).toBe('2px 6px');
  expect(Number.parseFloat(editorShell?.style.width ?? '0')).toBeGreaterThan(80);
  expect(Number.parseFloat(editorShell?.style.width ?? '0')).toBeLessThanOrEqual(772);
  act(() => enterEditor.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).not.toBeNull();
  const shiftEnter = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    shiftKey: true,
  });
  act(() => enterEditor.dispatchEvent(shiftEnter));
  expect(shiftEnter.defaultPrevented).toBe(false);
  enterText(enterEditor, 'Enter commit\n');
  expect(enterEditor.value).toBe('Enter commit\n');
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).not.toBeNull();
  enterText(enterEditor, 'First line\nSecond line');
  act(() =>
    enterEditor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  );
  expect(session.getSnapshot().document.objects.at(-1)).toMatchObject({
    text: 'First line\nSecond line',
  });
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).toBeNull();

  const outsideEditor = beginText(60, 70);
  enterText(outsideEditor, 'Outside commit');
  const down = new MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: 180,
    clientY: 190,
  });
  Object.defineProperty(down, 'pointerId', { value: 1 });
  act(() => canvas.dispatchEvent(down));
  act(() => {
    canvas.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 180, clientY: 190 })
    );
  });
  expect(session.getSnapshot().document.objects.at(-1)).toMatchObject({ text: 'Outside commit' });
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).toBeNull();

  const toolEditor = beginText(100, 110);
  enterText(toolEditor, 'Tool commit');
  const beforeToolCommit = session.getSnapshot().document.objects.length;
  act(() => toolEditor.dispatchEvent(new FocusEvent('blur', { bubbles: true })));
  act(() => controller.finalizeInteraction());
  act(() => session.setActiveTool('pencil'));
  expect(session.getSnapshot().document.objects.at(-1)).toMatchObject({ text: 'Tool commit' });
  expect(session.getSnapshot().document.objects).toHaveLength(beforeToolCommit + 1);
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).toBeNull();
  act(() => root.unmount());
});

it('opens an existing text with the Text tool and hides its canvas copy while editing', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: null,
    bounds: { x: 20, y: 30, width: 180, height: 40 },
    color: '#111827',
    fontSize: 20,
    id: 'existing-text',
    kind: 'text',
    text: 'Existing text',
  });
  session.setActiveTool('text');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  vi.clearAllMocks();
  const canvas = host.querySelector('canvas')!;

  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 40 });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
    });
    return event;
  };
  act(() => canvas.dispatchEvent(pointer('pointerdown', 40)));
  expect(session.getSnapshot().selectedObjectIds).toEqual([]);
  act(() => canvas.dispatchEvent(pointer('pointermove', 43.99)));
  expect(session.getSnapshot().selectedObjectIds).toEqual([]);
  act(() => canvas.dispatchEvent(pointer('pointerup', 43.99)));
  expect(session.getSnapshot().selectedObjectIds).toEqual(['existing-text']);

  act(() =>
    canvas.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 })
    )
  );

  expect(
    host.querySelector<HTMLTextAreaElement>('[data-ui="content.drawing.text-input"]')?.value
  ).toBe('Existing text');
  expect(session.getSnapshot().selectedObjectId).toBe('existing-text');
  expect(context.clearRect).toHaveBeenCalled();
  expect(context.fillText).not.toHaveBeenCalled();

  const editor = host.querySelector<HTMLElement>('[data-ui="content.drawing.text-input"]')!;
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
  act(() => session.setActiveTool('select'));
  vi.clearAllMocks();
  act(() =>
    canvas.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 })
    )
  );
  expect(
    host.querySelector<HTMLTextAreaElement>('[data-ui="content.drawing.text-input"]')?.value
  ).toBe('Existing text');
  expect(context.clearRect).toHaveBeenCalled();
  expect(context.fillText).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('keeps the text baseline and per-line background stable while switching to editing', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: '#fef08a',
    bounds: { x: 20, y: 30, width: 180, height: 40 },
    color: '#111827',
    fontSize: 20,
    id: 'stable-text',
    kind: 'text',
    text: 'Stable text',
  });
  session.setActiveTool('text');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));

  const canvas = host.querySelector('canvas')!;
  act(() =>
    canvas.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 })
    )
  );

  const editor = host.querySelector<HTMLElement>('[data-ui="content.drawing.text-input"]')!;
  expect(editor.parentElement?.style.top).toBe('30px');
  expect(editor.parentElement?.style.fontSize).toBe('0px');
  expect(editor.parentElement?.style.lineHeight).toBe('0');
  expect(context.fillText).not.toHaveBeenCalled();
  expect(host.querySelectorAll('[data-ui="content.drawing.text-background"]')).toHaveLength(1);
  expect(editor.style.backgroundColor).toBe('transparent');
  expect(editor.style.fontFamily).toContain('system-ui');
  expect(editor.style.fontSize).toBe('20px');
  expect(editor.style.lineHeight).toBe('25px');
  expect(editor.style.padding).toBe('2px 6px');
  act(() => root.unmount());
});

it('resizes a selected text box from its handle while the Text tool remains active', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: null,
    bounds: { x: 20, y: 30, width: 80, height: 40 },
    color: '#111827',
    fontSize: 20,
    id: 'resizable-text',
    kind: 'text',
    text: 'Short',
  });
  session.setActiveTool('text');
  session.select('resizable-text');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX,
      clientY: 50,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
    });
    return event;
  };

  act(() => {
    canvas.dispatchEvent(pointer('pointermove', 100));
  });
  expect(canvas.style.cursor).toBe('ew-resize');
  act(() => {
    canvas.dispatchEvent(pointer('pointerdown', 100));
    canvas.dispatchEvent(pointer('pointermove', 280));
    canvas.dispatchEvent(pointer('pointerup', 280));
  });

  expect(session.getSnapshot().document.objects[0]).toMatchObject({
    bounds: { x: 20, width: 260 },
  });
  act(() => root.unmount());
});

it('renders a text background behind each visual line instead of the full text block', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: '#fef08a',
    bounds: { x: 10, y: 20, width: 320, height: 80 },
    color: '#111827',
    fontSize: 20,
    id: 'text-background',
    kind: 'text',
    text: 'First line\nSecond line',
  });
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));

  const path = host.querySelector('path[data-ui="content.drawing.text-background"]');
  expect(path?.getAttribute('d')?.match(/A /g)).toHaveLength(6);
  act(() => root.unmount());
});

it('isolates annotation chrome only while the Drawing surface is active', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  expect(domHostMocks.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-drawing-mode-active',
    true
  );

  act(() =>
    root.render(<DrawingSurface active={false} chromeHidden={false} controller={controller} />)
  );
  expect(domHostMocks.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-drawing-mode-active',
    false
  );
  act(() => root.unmount());
  expect(domHostMocks.toggleContentHostClass).toHaveBeenLastCalledWith(
    'sniptale-drawing-mode-active',
    false
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('projects viewport and internal-scroll coordinates into one scene space', () => {
  const element = document.createElement('div');
  element.scrollLeft = 20;
  element.scrollTop = 30;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 500,
    bottom: 350,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
  const root = { kind: 'element' as const, element };
  expect(getDrawingViewportProjection(root)).toEqual({ x: -80, y: -20 });
  expect(toDrawingScenePoint({ clientX: 120, clientY: 80 }, root)).toEqual({ x: 40, y: 60 });
});

it('commits a speed-sampled pencil object and becomes click-through outside Drawing mode', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  let finalizer: (() => void) | null = null;
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: (next) => {
      finalizer = next;
    },
    finalizeInteraction: () => finalizer?.(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;
  expect(canvas.style.cursor).toBe(resolveDrawingToolCursor('pencil'));
  const hostPointer = vi.fn();
  const hostClick = vi.fn();
  const hostContextMenu = vi.fn();
  const hostWheel = vi.fn();
  document.addEventListener('pointerdown', hostPointer);
  document.addEventListener('click', hostClick);
  document.addEventListener('contextmenu', hostContextMenu);
  document.addEventListener('wheel', hostWheel);
  const dispatchPointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
  };
  act(() => {
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 40, 20);
    dispatchPointer('pointerup', 40, 20);
  });
  expect(session.getSnapshot().document.objects[0]).toMatchObject({
    id: 'drawing-object-id',
    kind: 'pencil',
    width: 4,
  });
  act(() => {
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 20 }));
  });
  expect(hostPointer).not.toHaveBeenCalled();
  expect(hostClick).not.toHaveBeenCalled();
  expect(hostContextMenu).not.toHaveBeenCalled();
  expect(hostWheel).toHaveBeenCalledTimes(1);

  act(() => {
    dispatchPointer('pointerdown', 50, 50);
    dispatchPointer('pointermove', 90, 70);
    controller.finalizeInteraction();
  });
  expect(session.getSnapshot().document.objects).toHaveLength(2);
  expect(context.clearRect).toHaveBeenCalled();

  act(() => {
    session.setActiveTool('text');
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 120,
        clientY: 90,
      })
    );
  });
  expect(canvas.style.cursor).toBe('text');
  const textEditor = host.querySelector<HTMLElement>('[data-ui="content.drawing.text-input"]');
  expect(textEditor).not.toBeNull();
  expect(document.activeElement).toBe(textEditor);
  act(() => {
    textEditor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    textEditor?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  expect(hostClick).not.toHaveBeenCalled();
  expect(hostContextMenu).not.toHaveBeenCalled();

  act(() => {
    if (textEditor instanceof HTMLTextAreaElement) inputText(textEditor, 'Persistent note');
    root.render(<DrawingSurface active={false} chromeHidden={false} controller={controller} />);
  });
  expect(host.querySelector('[data-ui="content.drawing.text-input"]')).toBeNull();
  expect(session.getSnapshot().document.objects.at(-1)).toMatchObject({
    kind: 'text',
    text: 'Persistent note',
  });
  expect(context.fillText).not.toHaveBeenCalled();
  expect(host.querySelector('[data-ui="content.drawing.text-object"]')?.textContent).toContain(
    'Persistent note'
  );

  expect(
    host.querySelector<HTMLElement>('[data-ui="content.drawing.surface"]')?.style.pointerEvents
  ).toBe('none');
  expect(canvas.style.cursor).toBe('default');
  expect(session.getSnapshot().document.objects).toHaveLength(3);
  act(() => root.unmount());
});

it('keeps drawing content editable without invisible resize handles during recording', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    id: 'box',
    kind: 'rectangle',
    bounds: { x: 100, y: 100, width: 100, height: 60 },
    color: '#f00',
    fillColor: '#f00',
    width: 2,
  });
  session.setActiveTool('select');
  session.select('box');
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#f00'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const event = (type: string, clientX: number, clientY: number) => {
    const value = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
    Object.defineProperties(value, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
    return value;
  };
  try {
    act(() =>
      root.render(
        <DrawingSurface active chromeHidden={false} serviceUiSuppressed controller={controller} />
      )
    );
    const chrome = host.querySelector<HTMLCanvasElement>(
      '[data-ui="content.drawing.selection-chrome"]'
    )!;
    const canvas =
      host.querySelector<HTMLCanvasElement>('[data-ui="content.drawing.canvas"]') ??
      host.querySelector<HTMLCanvasElement>('canvas')!;
    expect(chrome.hidden).toBe(true);
    act(() => canvas.dispatchEvent(event('pointerdown', 100, 100)));
    act(() => canvas.dispatchEvent(event('pointermove', 120, 120)));
    act(() => canvas.dispatchEvent(event('pointerup', 120, 120)));
    const object = session.getSnapshot().document.objects[0]!;
    expect(object.kind).toBe('rectangle');
    if (object.kind !== 'rectangle') throw new Error('Expected rectangle');
    expect(object.bounds).toEqual({ x: 120, y: 120, width: 100, height: 60 });
    act(() =>
      root.render(
        <DrawingSurface
          active
          chromeHidden={false}
          serviceUiSuppressed={false}
          controller={controller}
        />
      )
    );
    expect(chrome.hidden).toBe(false);
    act(() => canvas.dispatchEvent(event('pointerdown', 120, 120)));
    act(() => canvas.dispatchEvent(event('pointermove', 100, 100)));
    act(() => canvas.dispatchEvent(event('pointerup', 100, 100)));
    const resized = session.getSnapshot().document.objects[0]!;
    if (resized.kind !== 'rectangle') throw new Error('Expected rectangle');
    expect(resized.bounds).toEqual({ x: 100, y: 100, width: 120, height: 80 });
  } finally {
    act(() => root.unmount());
  }
});
