import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { EditorInspectorLayersHeader, EditorInspectorLayersList } from './header';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock('./file-input', () => ({
  LayerInsertImageControl: () => <button data-ui="mock.insert" type="button" />,
}));
vi.mock('./row', () => ({
  LayerRow: ({ layer }: { layer: { id: string } }) => <div data-ui={`mock.layer.${layer.id}`} />,
}));

it('renders layer header collapse affordance and insert action', () => {
  const onToggleAutoNavigateSelectedLayer = vi.fn();
  const markup = renderToStaticMarkup(
    <EditorInspectorLayersHeader
      autoNavigateSelectedLayer
      expanded
      layerCount={3}
      onCollapsePanel={vi.fn()}
      onToggle={vi.fn()}
      onToggleAutoNavigateSelectedLayer={onToggleAutoNavigateSelectedLayer}
    />
  );

  expect(markup).toContain('editor.layers.action-rail');
  expect(markup).toContain('editor.layers.auto-navigate');
  expect(markup).toContain('editor.toolbar.layerAutoNavigate');
  expect(markup).toContain('data-active="true"');
  expect(markup).toContain('mock.insert');
  expect(markup).toContain('editor.toolbar.layersTitle');
  expect(markup).toContain('text-[12px] font-semibold uppercase');
  expect(markup).not.toContain(
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]'
  );
});

it('renders layer rows or empty state with stable scroll classes', () => {
  const rows = renderToStaticMarkup(
    <EditorInspectorLayersList
      layers={[{ id: 'layer-1' } as never]}
      dragOverLayerId={null}
      setDraggedLayerId={vi.fn()}
      setDragOverLayerId={vi.fn()}
      onDrop={vi.fn()}
      onOpenLayerEffects={vi.fn()}
      reserveScrollbarGutter
      scrollable
    />
  );
  const empty = renderToStaticMarkup(
    <EditorInspectorLayersList
      layers={[]}
      dragOverLayerId={null}
      setDraggedLayerId={vi.fn()}
      setDragOverLayerId={vi.fn()}
      onDrop={vi.fn()}
      onOpenLayerEffects={vi.fn()}
    />
  );

  expect(rows).toContain('mock.layer.layer-1');
  expect(rows).toContain('overflow-y-auto');
  expect(rows).toContain('[scrollbar-gutter:stable_both-edges]');
  expect(empty).toContain('editor.toolbar.noLayers');
});
