// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorTool } from '../../../features/editor/document/types';
import type { CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';

const listeners = new Map<string, Set<() => void>>();
const mocks = vi.hoisted(() => ({
  drawingOptions: vi.fn((props: { selectedType?: string | null; tool: string }) => (
    <div data-ui={`drawing-options.${props.tool}`}>{props.selectedType}</div>
  )),
}));
const controller = {
  canvas: {
    off: vi.fn((event: string, handler: () => void) => listeners.get(event)?.delete(handler)),
    on: vi.fn((event: string, handler: () => void) => {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(handler);
      listeners.set(event, bucket);
    }),
  },
};

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => controller,
}));
vi.mock('../../drawing/options', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/options')>()),
  EditorDrawingOptions: mocks.drawingOptions,
}));

import { EditorFloatingToolPropertiesRail } from './tool-properties-rail';

let container: HTMLDivElement;
let root: Root;

function command(id: string): CompactCommand {
  return { content: <div data-ui={`content.${id}`} />, id, title: id, trigger: id };
}

function selection(
  overrides: Partial<EditorToolbarSelectionState> = {}
): EditorToolbarSelectionState {
  return {
    hasSelection: false,
    selectedObjectCount: 0,
    selectedObjectId: null,
    selectedObjectType: null,
    ...overrides,
  };
}

function renderRail(
  overrides: {
    activeTool?: EditorTool;
    collapsedDrawingOptionsTool?: EditorTool | null;
    documentController?: { compactCommandGroups?: CompactCommand[][]; inspector?: string };
    hasImage?: boolean;
    leftDrawerOpen?: boolean;
    selection?: Partial<EditorToolbarSelectionState>;
  } = {}
) {
  const documentController = Object.assign(Object.create(null), {
    compactCommandGroups: [[command('step-color'), command('step-size')]],
    inspector: 'tool',
    ...overrides.documentController,
  });
  act(() => {
    root.render(
      <EditorFloatingToolPropertiesRail
        activeTool={overrides.activeTool ?? 'pencil'}
        collapsedDrawingOptionsTool={overrides.collapsedDrawingOptionsTool ?? null}
        documentController={documentController}
        hasImage={overrides.hasImage ?? true}
        leftDrawerOpen={overrides.leftDrawerOpen ?? false}
        selection={selection(overrides.selection)}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  listeners.clear();
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('anchors current drawing tools and renders their shared options directly', () => {
  renderRail({ activeTool: 'pencil', documentController: { compactCommandGroups: [] } });
  expect(container.querySelector('[data-ui="drawing-options.pencil"]')).not.toBeNull();
  const properties = container.querySelector<HTMLElement>(
    '[data-ui="editor.floating.tool-properties"]'
  );
  expect(properties?.className).toContain('left-1/2');
  expect(properties?.className).toContain('top-[4.5rem]');
  expect(properties?.className).toContain('-translate-x-1/2');

  renderRail({
    activeTool: 'select',
    documentController: { compactCommandGroups: [] },
    selection: { hasSelection: true, selectedObjectCount: 1, selectedObjectType: 'blur' },
  });
  expect(container.querySelector('[data-ui="drawing-options.blur"]')).not.toBeNull();
});

it('keeps retained step command groups interactive and dismissible', () => {
  renderRail({ activeTool: 'step' });
  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.tool-properties.group.fill"]'
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
  expect(
    container.querySelector('[data-ui="editor.floating.tool-properties.popover.fill"]')
  ).not.toBeNull();
  act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(
    container.querySelector('[data-ui="editor.floating.tool-properties.popover.fill"]')
  ).toBeNull();
});

it('keeps frame controls in the shared top toolbar and hides unavailable surfaces', () => {
  renderRail({ activeTool: 'frame-annotation', documentController: { compactCommandGroups: [] } });
  expect(container.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();

  renderRail({ activeTool: 'select', documentController: { compactCommandGroups: [] } });
  expect(container.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();

  renderRail({
    activeTool: 'step',
    documentController: { inspector: 'frame' },
    hasImage: false,
  });
  expect(container.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();
});

it('keeps drawing options stable during canvas interaction and only honors an explicit toggle', () => {
  renderRail({ activeTool: 'pencil' });
  act(() => listeners.get('mouse:down')?.forEach((handler) => handler()));
  expect(container.querySelector('[data-ui="editor.floating.tool-properties"]')).not.toBeNull();
  expect(controller.canvas.on).not.toHaveBeenCalled();

  renderRail({ activeTool: 'pencil', collapsedDrawingOptionsTool: 'pencil' });
  expect(container.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();

  renderRail({
    activeTool: 'shape',
    collapsedDrawingOptionsTool: 'shape',
    selection: { hasSelection: true, selectedObjectCount: 1, selectedObjectType: 'shape' },
  });
  expect(container.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();

  renderRail({
    activeTool: 'select',
    collapsedDrawingOptionsTool: 'pencil',
    selection: { hasSelection: true, selectedObjectCount: 1, selectedObjectType: 'pencil' },
  });
  expect(container.querySelector('[data-ui="drawing-options.pencil"]')).not.toBeNull();

  renderRail({
    activeTool: 'select',
    selection: {
      hasSelection: true,
      selectedObjectCount: 2,
      selectedObjectType: null,
      selectedObjectsAreDrawing: true,
    },
  });
  expect(container.querySelector('[data-ui="drawing-options.selection"]')).not.toBeNull();
});
