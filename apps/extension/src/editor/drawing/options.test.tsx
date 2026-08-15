import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  colorOptions: vi.fn((props: { floatingPlacement: string; vertical: boolean }) => (
    <span
      data-placement={props.floatingPlacement}
      data-ui="mock.color-options"
      data-vertical={String(props.vertical)}
    />
  )),
  divider: vi.fn((props: { vertical: boolean }) => (
    <span data-ui="mock.divider" data-vertical={String(props.vertical)} />
  )),
}));

vi.mock('../../ui/drawing-tools/options', () => ({
  ArrowWidthModeOptions: () => <span data-ui="mock.arrow-mode-options" />,
  DrawingColorOptions: mocks.colorOptions,
  DrawingDeleteOption: () => null,
  DrawingDeselectOption: () => null,
  DrawingOptionsDivider: mocks.divider,
  DrawingShapeFillOptions: () => null,
  DrawingShapeOptions: () => null,
  DrawingTextOptions: () => null,
  DrawingWidthOptions: (props: { tool: string }) => (
    <span data-tool={props.tool} data-ui="mock.width-options" />
  ),
  MarkerOpacityOptions: () => <span data-ui="mock.marker-opacity-options" />,
}));

const storeState = {
  selectionToolSettings: {},
  toolSettings: {
    arrow: {
      color: '#333333',
      design: 'standard' as const,
      dynamicWidth: false,
      width: 12,
    },
    marker: { color: '#222222', opacity: 0.5, width: 24 },
    pencil: { color: '#111111', width: 4 },
  },
};

vi.mock('../state/useEditorStore', () => ({
  useEditorStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  ),
}));

vi.mock('../../composition/persistence/drawing-palette', () => ({
  createDefaultDrawingPaletteState: () => ({ colors: ['#111111', '#ffffff'] }),
  loadDrawingPaletteState: vi.fn(),
  subscribeToDrawingPaletteState: vi.fn(() => vi.fn()),
}));

import { EditorDrawingOptions } from './options';

it('renders editor tool settings as a horizontal toolbar like content drawing mode', () => {
  const markup = renderToStaticMarkup(
    <EditorDrawingOptions
      onApplyToSelection={vi.fn()}
      onClearSelection={vi.fn()}
      onDeleteSelection={vi.fn()}
      selectedType={null}
      tool="pencil"
    />
  );

  expect(markup).toContain('flex-row');
  expect(markup).not.toContain('flex-col');
  expect(markup).toContain('data-ui="mock.divider" data-vertical="false"');
  expect(markup).toContain(
    'data-placement="auto" data-ui="mock.color-options" data-vertical="false"'
  );
});

it.each([
  ['pencil', ['mock.color-options', 'mock.width-options']],
  ['marker', ['mock.color-options', 'mock.width-options', 'mock.marker-opacity-options']],
  ['arrow', ['mock.color-options', 'mock.width-options', 'mock.arrow-mode-options']],
] as const)('matches the content left-to-right control order for %s', (tool, expectedOrder) => {
  const markup = renderToStaticMarkup(
    <EditorDrawingOptions
      onApplyToSelection={vi.fn()}
      onClearSelection={vi.fn()}
      onDeleteSelection={vi.fn()}
      selectedType={null}
      tool={tool}
    />
  );

  const positions = expectedOrder.map((dataUi) => markup.indexOf(`data-ui="${dataUi}"`));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
});
