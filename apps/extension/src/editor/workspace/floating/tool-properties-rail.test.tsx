// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CompactCommand } from '../../inspector/compact';
import { useEditorStore } from '../../state/useEditorStore';
import {
  buildRasterBrushCompactCommands,
  buildRasterEraserCompactCommands,
  buildRasterFillCompactCommands,
  buildRasterSelectionCompactCommands,
} from '../../inspector/compact/tool-commands/raster';
import { EditorFloatingToolPropertiesRail } from './tool-properties-rail';
import { ToolPropertiesButton } from './tool-properties-button';

const listeners = new Map<string, Set<() => void>>();
const controller = vi.hoisted(() => ({
  canvas: {
    off: vi.fn((event: string, handler: () => void) => listeners.get(event)?.delete(handler)),
    on: vi.fn((event: string, handler: () => void) => {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(handler);
      listeners.set(event, bucket);
    }),
  },
}));

vi.mock('../../application/controller-context', () => ({
  EditorControllerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEditorController: () => controller,
  useOptionalEditorController: () => null,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function command(id: string): CompactCommand {
  return { id, title: id, trigger: id, content: <div data-ui={`content.${id}`} /> };
}

function buildRasterCommands(activeTool: 'selection' | 'brush' | 'eraser' | 'fill') {
  const controller = { clearRasterSelection: vi.fn() };
  if (activeTool === 'selection') {
    return buildRasterSelectionCompactCommands(controller);
  }
  if (activeTool === 'brush') {
    return buildRasterBrushCompactCommands(controller);
  }
  if (activeTool === 'eraser') {
    return buildRasterEraserCompactCommands(controller);
  }
  return buildRasterFillCompactCommands(controller);
}

function renderRail(overrides: Record<string, unknown> = {}) {
  const selection = (overrides['selection'] as never) ?? ({ hasSelection: false } as never);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditorFloatingToolPropertiesRail
        activeTool={(overrides['activeTool'] as never) ?? 'arrow'}
        documentController={
          {
            compactCommandGroups: [[command('arrow-color'), command('arrow-width')]],
            inspector: 'tool',
            ...overrides,
          } as never
        }
        hasImage
        leftDrawerOpen={false}
        selection={selection}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  listeners.clear();
  vi.clearAllMocks();
  useEditorStore.setState({
    rasterToolSettings: {
      ...useEditorStore.getState().rasterToolSettings,
      brushColor: '#ea580c',
      brushHardness: 0.85,
      brushOpacity: 1,
      brushSize: 24,
      fillMode: 'bucket',
      selectionMode: 'marquee',
    },
    rasterSelection: {
      hasSelection: true,
      targetLayerId: 'layer-1',
      targetLayerName: 'Layer 1',
    },
  } as never);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows future-tool properties as a vertical rail and opens titleless group popovers', () => {
  renderRail();

  const rail = container?.querySelector<HTMLElement>('[data-ui="editor.floating.tool-properties"]');
  expect(rail).not.toBeNull();
  expect(rail?.style.getPropertyValue('--editor-tool-properties-top')).toContain('50vh');
  const colorButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.tool-properties.group.line-color"]'
  );
  const sizeButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.tool-properties.group.geometry"]'
  );

  expect(colorButton).not.toBeNull();
  expect(sizeButton).not.toBeNull();
  expect(sizeButton?.textContent).toContain('arrow-width');

  act(() => colorButton?.click());

  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.popover.line-color"]')
  ).not.toBeNull();
  expect(
    container?.querySelector<HTMLElement>(
      '[data-ui="editor.floating.tool-properties.popover.line-color"]'
    )?.className
  ).toContain('top-[var(--editor-tool-properties-popover-top)]');
  expect(
    container
      ?.querySelector<HTMLElement>('[data-ui="editor.floating.tool-properties.popover.line-color"]')
      ?.style.getPropertyValue('--editor-floating-popover-max-height')
  ).toBeTruthy();
  expect(container?.querySelector('[data-ui="content.arrow-color"]')).not.toBeNull();
});

it('uses the same popover width tokens as the canvas toolbar groups', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ToolPropertiesButton
        active
        group={{
          id: 'shadow',
          kind: 'effects',
          title: 'Shadow',
          trigger: 'S',
          content: <div>Shadow controls</div>,
          width: 'rich',
        }}
        onToggle={vi.fn()}
      />
    );
  });

  expect(
    container?.querySelector<HTMLElement>(
      '[data-ui="editor.floating.tool-properties.popover.shadow"]'
    )?.className
  ).toContain('w-[min(22rem,calc(100vw-6rem))]');
});

it('keeps a group open while interacting with portaled floating child layers', () => {
  renderRail();

  const colorButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.tool-properties.group.line-color"]'
  );
  act(() => colorButton?.click());
  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.popover.line-color"]')
  ).not.toBeNull();

  const floatingLayer = document.createElement('div');
  floatingLayer.setAttribute('data-floating-ui-root', 'true');
  document.body.append(floatingLayer);

  act(() => {
    floatingLayer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.popover.line-color"]')
  ).not.toBeNull();

  act(() => {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.popover.line-color"]')
  ).toBeNull();

  floatingLayer.remove();
});

it('hides while drawing and stays absent for non-tool inspectors', () => {
  renderRail();

  act(() => {
    listeners.get('mouse:down')?.forEach((handler) => handler());
  });

  expect(container?.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();

  act(() => root?.unmount());
  root = null;
  container?.remove();
  renderRail({ inspector: 'frame' });

  expect(container?.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();
});

it('does not show the crop compact popover while canvas and image size controls own crop UI', () => {
  renderRail({
    activeTool: 'crop',
    compactCommandGroups: [[command('crop-status'), command('crop-apply')]],
  });

  expect(container?.querySelector('[data-ui="editor.floating.tool-properties"]')).toBeNull();
  expect(container?.textContent).not.toContain('crop-status');
});

it.each(['selection', 'brush', 'eraser', 'fill'] as const)(
  'keeps %s tool properties visible while a layer remains selected',
  (activeTool) => {
    renderRail({
      activeTool,
      compactCommandGroups: [buildRasterCommands(activeTool)],
      selection: { hasSelection: true, selectedObjectId: 'layer-1' },
    });

    expect(container?.querySelector('[data-ui="editor.floating.tool-properties"]')).not.toBeNull();
  }
);

it('groups brush compact commands by geometry, fill, effects, and more', () => {
  renderRail({
    activeTool: 'brush',
    compactCommandGroups: [buildRasterBrushCompactCommands({ clearRasterSelection: vi.fn() })],
  });

  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.group.geometry"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.group.fill"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.group.effects"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.group.more"]')
  ).not.toBeNull();
  expect(container?.textContent).not.toContain('raster-brush-clear');
});

it('keeps raster tool future settings clickable while excluding selection-clear actions', () => {
  renderRail({
    activeTool: 'fill',
    compactCommandGroups: [buildRasterFillCompactCommands({ clearRasterSelection: vi.fn() })],
  });

  expect(
    container?.querySelector('[data-ui="editor.floating.tool-properties.group.fill"]')
  ).not.toBeNull();
  expect(container?.textContent).not.toContain('CLR');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.tool-properties.group.fill"]')
      ?.click();
  });

  const options = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="group"] button') ?? []
  );
  const inactiveOption = options.find((option) => option.getAttribute('aria-pressed') === 'false');
  expect(inactiveOption).toBeDefined();

  act(() => inactiveOption?.click());

  expect(useEditorStore.getState().rasterToolSettings.fillMode).toBe('linear-gradient');
});
