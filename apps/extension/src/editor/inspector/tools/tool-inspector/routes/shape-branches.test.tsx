import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteShape: vi.fn(),
  disableShape: vi.fn(),
  importFile: vi.fn(),
  props: null as Record<string, unknown> | null,
  setRichShapeToolSelection: vi.fn(),
}));
vi.mock('../../shape-browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shape-browser')>()),
  ShapeBrowser: (props: Record<string, unknown>) => {
    mocks.props = props;
    return <div data-ui="shape-browser" />;
  },
}));
vi.mock('../../shape-browser/custom-shapes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shape-browser/custom-shapes')>()),
  useShapeBrowserCustomShapes: () => ({
    deleteShape: mocks.deleteShape,
    disableShape: mocks.disableShape,
    entries: [],
    importFile: mocks.importFile,
    importState: { status: 'idle' },
  }),
}));
vi.mock('../../../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../state/useEditorStore')>()),
  useEditorStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ richShapeToolSelection: null }),
    { getState: () => ({ setRichShapeToolSelection: mocks.setRichShapeToolSelection }) }
  ),
}));

import { renderShapesAndLinesBranch } from './shape-branches';

it('renders the combined catalog and selects built-in or imported shapes for drawing', () => {
  expect(renderToStaticMarkup(renderShapesAndLinesBranch())).toContain('shape-browser');
  const onSelect = mocks.props?.['onSelect'];
  if (typeof onSelect !== 'function') throw new Error('Expected shape selection callback');
  onSelect({ customDefinition: { geometry: {} }, id: 'custom-shape' });
  expect(mocks.setRichShapeToolSelection).toHaveBeenCalledWith({
    customDefinition: { geometry: {} },
    rough: false,
    shapeId: 'custom-shape',
  });

  const onDeleteCustomShape = mocks.props?.['onDeleteCustomShape'];
  const onDisableCustomShape = mocks.props?.['onDisableCustomShape'];
  const onImportFile = mocks.props?.['onImportFile'];
  if (
    typeof onDeleteCustomShape !== 'function' ||
    typeof onDisableCustomShape !== 'function' ||
    typeof onImportFile !== 'function'
  ) {
    throw new Error('Expected custom shape callbacks');
  }
  onDeleteCustomShape({ id: 'delete-me' });
  onDisableCustomShape({ id: 'disable-me' });
  onImportFile({ name: 'shape.svg' });

  expect(mocks.deleteShape).toHaveBeenCalledWith('delete-me');
  expect(mocks.disableShape).toHaveBeenCalledWith('disable-me');
  expect(mocks.importFile).toHaveBeenCalledWith({ name: 'shape.svg' });
});
