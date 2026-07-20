// @vitest-environment jsdom

import { act, type RefObject, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildGroups: vi.fn((_: unknown) => [{ id: 'fill' }]),
  controller: {
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    setActiveTool: vi.fn(),
  },
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => mocks.controller,
}));

vi.mock('./canvas-toolbar-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas-toolbar-groups')>()),
  buildCanvasSelectionToolbarGroups: mocks.buildGroups,
}));

import { useCanvasToolbarGroups, useCanvasToolbarState } from './canvas-toolbar-state';
import type { FloatingToolbarGroup } from './canvas-toolbar-groups';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const POPOVER_TEST_GROUPS: FloatingToolbarGroup[] = [
  {
    id: 'fill',
    kind: 'fill',
    title: 'Fill',
    trigger: 'F',
    content: <div>Fill controls</div>,
    width: 'style',
  },
];

function createDocumentController() {
  return {
    arrangeSelection: vi.fn(),
    compactCommandGroups: [
      [
        { id: 'shape-fill-color', title: 'Fill', trigger: 'F', content: 'F' },
        { id: 'meta-technical-data', title: 'Meta', trigger: 'M', content: 'M' },
      ],
    ],
    openLayerEffects: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    syncActiveTool: vi.fn(),
  };
}

function renderGroupsHarness(documentController: ReturnType<typeof createDocumentController>) {
  function Harness() {
    useCanvasToolbarGroups({
      documentController: documentController as never,
      selection: { hasSelection: true, selectedObjectId: 'layer-1' } as never,
    });
    return null;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

function createTestRect(rect: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
}

function assignElementRect(element: Element | null, rect: DOMRect) {
  if (element) {
    element.getBoundingClientRect = () => rect;
  }
}

function StateHarness(props: { enabled: boolean; visibilityRevision: number }) {
  const state = useCanvasToolbarState(
    props.enabled,
    POPOVER_TEST_GROUPS,
    'above-selection',
    props.visibilityRevision
  );
  useEffect(() => {
    if (state.popoverRef.current) {
      Object.defineProperty(state.popoverRef.current, 'scrollHeight', {
        configurable: true,
        value: 240,
      });
    }
  }, [state.activeGroupId, state.popoverRef]);
  return (
    <div
      ref={(node) => {
        state.rootRef.current = node;
        assignElementRect(
          node,
          createTestRect({
            bottom: 190,
            height: 40,
            left: 160,
            right: 400,
            top: 150,
            width: 240,
            x: 160,
            y: 150,
          })
        );
      }}
      data-active={state.activeGroupId ?? ''}
      data-left={state.popoverLeft}
      data-max-height={state.popoverMaxHeight}
      data-placement={state.popoverPlacement}
    >
      <button
        type="button"
        ref={(node) => bindPopoverButton(state.buttonRefs, node)}
        onClick={() => state.setActiveGroupId('fill')}
      >
        Fill
      </button>
      {state.activeGroupId ? <div ref={state.popoverRef}>Popover</div> : null}
    </div>
  );
}

function bindPopoverButton(
  buttonRefs: RefObject<Map<string, HTMLButtonElement>>,
  node: HTMLButtonElement | null
) {
  if (!node) {
    buttonRefs.current.delete('fill');
    return;
  }
  assignElementRect(
    node,
    createTestRect({
      bottom: 190,
      height: 32,
      left: 210,
      right: 242,
      top: 158,
      width: 32,
      x: 210,
      y: 158,
    })
  );
  buttonRefs.current.set('fill', node);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('filters meta-only commands and routes common canvas toolbar handlers', () => {
  const documentController = createDocumentController();
  renderGroupsHarness(documentController);

  const args = mocks.buildGroups.mock.calls.at(-1)?.[0] as unknown as {
    commands: Array<{ id: string }>;
    handlers: {
      deleteSelection: () => void;
      duplicateSelection: () => void;
      openLayerEffects: (layerId: string, category: 'adjustments', activeEffectId: string) => void;
    };
  };

  expect(args.commands.map((command) => command.id)).toEqual(['shape-fill-color']);

  args.handlers.deleteSelection();
  args.handlers.duplicateSelection();
  args.handlers.openLayerEffects('layer-1', 'adjustments', 'brightness');

  expect(mocks.controller.deleteSelection).toHaveBeenCalledOnce();
  expect(mocks.controller.duplicateSelection).toHaveBeenCalledOnce();
  expect(mocks.controller.setActiveTool).toHaveBeenCalledWith('select');
  expect(documentController.syncActiveTool).toHaveBeenCalledWith('select');
  expect(documentController.openLayerEffects).toHaveBeenCalledWith(
    'layer-1',
    'adjustments',
    'brightness'
  );
  expect(documentController.setLayerEffectsCategory).toHaveBeenCalledWith('adjustments');
  expect(documentController.setInspector).toHaveBeenCalledWith('layer-effects');
});

it('opens, positions, dismisses, and resets canvas toolbar popovers', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn();
      observe = vi.fn();
    }
  );
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<StateHarness enabled visibilityRevision={1} />));
  act(() => container?.querySelector('button')?.click());

  const surface = container.querySelector('div');
  expect(surface?.dataset['active']).toBe('fill');
  expect(surface?.dataset['placement']).toBe('below');
  expect(Number(surface?.dataset['left'])).not.toBe(0);

  const floatingLayer = document.createElement('div');
  floatingLayer.setAttribute('data-floating-ui-root', 'true');
  document.body.append(floatingLayer);
  act(() => floatingLayer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(surface?.dataset['active']).toBe('fill');
  floatingLayer.remove();

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(surface?.dataset['active']).toBe('');

  act(() => container?.querySelector('button')?.click());
  expect(surface?.dataset['active']).toBe('fill');
  act(() => root?.render(<StateHarness enabled={false} visibilityRevision={1} />));
  expect(container.querySelector('div')?.dataset['active']).toBe('');

  act(() => container?.querySelector('button')?.click());
  act(() => root?.render(<StateHarness enabled visibilityRevision={2} />));
  expect(container.querySelector('div')?.dataset['active']).toBe('');
  vi.unstubAllGlobals();
});
