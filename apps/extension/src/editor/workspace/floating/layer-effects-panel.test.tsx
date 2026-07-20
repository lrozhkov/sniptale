import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { EditorFloatingLayerEffectsPanel } from './layer-effects-panel';

vi.mock('../../inspector/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/content')>()),
  EditorInspectorContent: ({ inspector }: { inspector: string }) => (
    <div data-inspector={inspector} data-ui="mock.inspector-content" />
  ),
}));

vi.mock('../../inspector/sidebar-expanded-content/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/sidebar-expanded-content/helpers')>()),
  createEditorInspectorContentPanelProps: vi.fn(() => ({})),
}));

function createProps(collapsedLayers: boolean) {
  return {
    collapsedLayers,
    documentController: {
      setInspector: vi.fn(),
    } as never,
    hasImage: true,
    inspectorMeta: {
      title: 'Color correction',
      subtitle: 'Layer effects',
    },
  };
}

it('renders layer effects beside expanded layers and closes through inspector routing', () => {
  const props = createProps(false);
  const markup = renderToStaticMarkup(<EditorFloatingLayerEffectsPanel {...props} />);

  expect(markup).toContain('right-[calc(100%+0.75rem)]');
  expect(markup).toContain('Color correction');
  expect(markup).not.toContain('Layer effects');
  expect(markup).toContain('text-[12px] font-bold uppercase');
  expect(markup).toContain('data-inspector="layer-effects"');
});

it('renders the collapsed-layers placement above the corner toolbar', () => {
  const markup = renderToStaticMarkup(<EditorFloatingLayerEffectsPanel {...createProps(true)} />);

  expect(markup).toContain('bottom-[calc(4.5rem+var(--editor-floating-edge-bottom,0px))]');
  expect(markup).toContain(
    'w-[min(21rem,calc(100vw-1.5rem-var(--editor-floating-edge-right,0px)))]'
  );
});
