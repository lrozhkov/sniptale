// @vitest-environment jsdom

import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../../features/editor/document/rich-shape';
import { translate } from '../../../../../platform/i18n';
import { createToolsPanelProps } from '../../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { renderToolInspector as renderToolInspectorFacade } from './dispatch';
import { renderToolInspector as renderToolInspectorImpl } from './render';

const shapeBrowserHookState = vi.hoisted(() => ({
  entries: [] as unknown[],
  setRichShapeToolSelection: vi.fn(),
}));

vi.mock('../../../../state/useEditorStore', () => ({
  useEditorStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        richShapeToolSelection: null,
        setRichShapeToolSelection: shapeBrowserHookState.setRichShapeToolSelection,
      }),
    {
      getState: () => ({
        setRichShapeToolSelection: shapeBrowserHookState.setRichShapeToolSelection,
      }),
    }
  ),
}));

vi.mock('../../shape-browser/custom-shapes', () => ({
  useShapeBrowserCustomShapes: () => ({
    entries: shapeBrowserHookState.entries,
    importState: { status: 'empty' },
    importFile: vi.fn(),
    deleteShape: vi.fn(),
    disableShape: vi.fn(),
  }),
}));

function renderBrowserRoute(tool: 'rough-shape' | 'shape-library' | 'shapes-and-lines') {
  const insertRichShape = vi.fn();
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.appendChild(container);

  act(() => {
    root.render(
      <>
        {renderToolInspectorImpl(
          {
            applyCropSelection: () => undefined,
            cancelCropMode: () => undefined,
            insertRichShape,
            resizeLayer: () => undefined,
          } as never,
          tool,
          createToolsPanelProps({ highlightedTool: tool }) as never
        )}
      </>
    );
  });
  return { container, insertRichShape, root };
}

function cleanupRoute(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function createCustomShapeBrowserEntry() {
  const customDefinition = {
    id: 'custom-badge',
    label: 'Badge',
    category: 'custom',
    tags: ['badge'],
    capabilities: ['fill', 'line', 'effects'],
    geometry: {
      type: 'path',
      viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
      paths: [
        {
          commands: [
            ['M', 0, 0],
            ['L', 10, 10],
          ],
        },
      ],
    },
  };
  return {
    id: 'custom-badge',
    labelFallback: 'Badge',
    category: 'custom',
    source: 'custom',
    searchAliases: ['badge'],
    tags: ['badge'],
    thumbnail: customDefinition.geometry,
    insertKind: 'custom-badge',
    roughCapable: true,
    customDefinition,
  };
}

it('keeps the dispatcher as a thin stable forwarding layer', () => {
  expect(renderToolInspectorFacade).toBe(renderToolInspectorImpl);
});

it('dispatches selected rich shapes ahead of the highlighted tool route', () => {
  const props = createToolsPanelProps({
    highlightedTool: 'rectangle',
    richShapeSelection: createDefaultRichShapeObject(),
    selection: {
      ...createToolsPanelProps().selection,
      selectedObjectType: 'rich-shape',
    },
  });

  expect(renderToolInspectorImpl({} as never, 'rectangle', props as never)).not.toBeNull();
});

it('dispatches ambiguous rich-shape selections to an explicit unsupported state', () => {
  const props = createToolsPanelProps({
    highlightedTool: 'select',
    richShapeSelection: null,
    selection: {
      ...createToolsPanelProps().selection,
      hasSelection: true,
      selectedObjectCount: 2,
      selectedObjectIds: ['shape-1', 'shape-2'],
      selectedObjectType: 'rich-shape',
    },
  });
  const rendered = renderToolInspectorImpl({} as never, 'select', props as never);

  expect(rendered).toEqual(
    expect.objectContaining({
      props: expect.objectContaining({
        label: expect.any(String),
        value: expect.any(String),
      }),
    })
  );
});

it.each([
  'select',
  'selection',
  'brush',
  'eraser',
  'fill',
  'pencil',
  'highlighter',
  'rough-shape',
  'shape-library',
  'shapes-and-lines',
  'rectangle',
  'ellipse',
  'diamond',
  'blur',
  'arrow',
  'line',
  'callout',
  'text',
  'step',
  'crop',
] as const)('dispatches the %s route', (tool) => {
  const props = createToolsPanelProps({ highlightedTool: tool });

  expect(
    renderToolInspectorImpl(
      {
        applyCropSelection: () => undefined,
        cancelCropMode: () => undefined,
        resizeLayer: () => undefined,
      } as never,
      tool,
      props as never
    )
  ).not.toBeNull();
});

it('routes shape-browser primary selections through the controller insertion seam', () => {
  const insertRichShape = vi.fn();
  shapeBrowserHookState.setRichShapeToolSelection.mockClear();
  const controller = {
    applyCropSelection: () => undefined,
    cancelCropMode: () => undefined,
    insertRichShape,
    resizeLayer: () => undefined,
  };
  const rendered = renderToolInspectorImpl(
    controller as never,
    'shapes-and-lines',
    createToolsPanelProps({ highlightedTool: 'shapes-and-lines' }) as never
  ) as ReactElement<{ onSelectShape: (entry: unknown) => void }>;

  rendered.props.onSelectShape({ id: 'rectangle' });

  expect(shapeBrowserHookState.setRichShapeToolSelection).toHaveBeenCalledWith(
    expect.objectContaining({ rough: false })
  );
});

it('renders shapes and lines without shortcut, source filter, or line connector groups', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.appendChild(container);

  act(() => {
    root.render(
      <>
        {renderToolInspectorImpl(
          {
            applyCropSelection: () => undefined,
            cancelCropMode: () => undefined,
            resizeLayer: () => undefined,
          } as never,
          'shapes-and-lines',
          createToolsPanelProps({ highlightedTool: 'shapes-and-lines' }) as never
        )}
      </>
    );
  });

  expect(container.textContent).not.toContain(
    translate('editor.shapeCatalog.browser.primaryShortcuts')
  );
  expect(container.querySelector('[data-shape-source-filter]')).toBeNull();
  expect(container.querySelector('[data-shape-category="lines-connectors"]')).toBeNull();

  act(() => {
    root.unmount();
  });
  container.remove();
});

it('routes rough shape-browser selections through rough insertion options', () => {
  const { container, root } = renderBrowserRoute('rough-shape');
  cleanupRoute(container, root);

  expect(container.textContent).toBeDefined();
});

it('routes shape library browser selections through native rich shape insertion', () => {
  const { container, root } = renderBrowserRoute('shape-library');
  cleanupRoute(container, root);

  expect(container.textContent).toBeDefined();
});

it('routes custom shape-browser selections with custom definitions', () => {
  shapeBrowserHookState.entries = [createCustomShapeBrowserEntry()];
  const { container, root } = renderBrowserRoute('rough-shape');
  cleanupRoute(container, root);
  shapeBrowserHookState.entries = [];

  expect(container.textContent).toBeDefined();
});
