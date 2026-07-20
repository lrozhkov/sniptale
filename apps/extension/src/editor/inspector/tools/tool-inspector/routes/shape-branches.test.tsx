// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteShape: vi.fn(),
  disableShape: vi.fn(),
  importFile: vi.fn(),
  setRichShapeToolSelection: vi.fn(),
}));

vi.mock('../../../../state/useEditorStore', () => ({
  useEditorStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        richShapeToolSelection: { shapeId: 'selected-shape' },
      }),
    {
      getState: () => ({
        setRichShapeToolSelection: mocks.setRichShapeToolSelection,
      }),
    }
  ),
}));

vi.mock('../../shape-browser/custom-shapes', () => ({
  useShapeBrowserCustomShapes: () => ({
    deleteShape: mocks.deleteShape,
    disableShape: mocks.disableShape,
    entries: [{ id: 'custom-entry' }],
    importFile: mocks.importFile,
    importState: { status: 'empty' },
  }),
}));

vi.mock('../../shape-browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shape-browser')>()),
  ShapeBrowser: (props: Record<string, unknown>) => (
    <div
      data-default-source-filter={String(props['defaultSourceFilter'] ?? '')}
      data-selected-entry-id={String(props['selectedEntryId'] ?? '')}
      data-show-source-filters={String(props['showSourceFilters'] ?? '')}
    >
      <button
        type="button"
        onClick={() =>
          (props['onSelect'] as (entry: Record<string, unknown>) => void)({
            customDefinition: { id: 'custom-definition' },
            id: 'shape-entry',
          })
        }
      />
      <button
        type="button"
        onClick={() =>
          (props['onDeleteCustomShape'] as (entry: { id: string }) => void)({ id: 'delete-me' })
        }
      />
      <button
        type="button"
        onClick={() =>
          (props['onDisableCustomShape'] as (entry: { id: string }) => void)({ id: 'disable-me' })
        }
      />
      <button
        type="button"
        onClick={() =>
          (props['onImportFile'] as (file: File) => void)(new File(['x'], 'shape.svg'))
        }
      />
    </div>
  ),
}));

import { renderRoughShapeBranch, renderShapesAndLinesBranch } from './shape-branches';

function renderBranch(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<>{node}</>));
  return { container, root };
}

it('wires rough shape browser selections and custom-shape management callbacks', () => {
  const { container, root } = renderBranch(renderRoughShapeBranch());

  container.querySelectorAll('button').forEach((button) => button.click());

  const browser = container.querySelector('[data-default-source-filter]');

  expect(browser?.getAttribute('data-default-source-filter')).toBe('built-in');
  expect(browser?.getAttribute('data-selected-entry-id')).toBe('selected-shape');
  expect(mocks.setRichShapeToolSelection).toHaveBeenCalledWith({
    customDefinition: { id: 'custom-definition' },
    rough: true,
    shapeId: 'shape-entry',
  });
  expect(mocks.deleteShape).toHaveBeenCalledWith('delete-me');
  expect(mocks.disableShape).toHaveBeenCalledWith('disable-me');
  expect(mocks.importFile).toHaveBeenCalledWith(expect.any(File));

  act(() => root.unmount());
  container.remove();
});

it('wires shapes-and-lines browser selections without rough mode', () => {
  const { container, root } = renderBranch(renderShapesAndLinesBranch());

  container.querySelector('button')?.click();

  const browser = container.querySelector('[data-default-source-filter]');

  expect(browser?.getAttribute('data-default-source-filter')).toBe('all');
  expect(mocks.setRichShapeToolSelection).toHaveBeenCalledWith({
    customDefinition: { id: 'custom-definition' },
    rough: false,
    shapeId: 'shape-entry',
  });

  act(() => root.unmount());
  container.remove();
});
