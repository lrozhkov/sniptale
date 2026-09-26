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

it('renders an inline body with a layers return action and without duplicate title chrome', () => {
  const markup = renderToStaticMarkup(
    <EditorFloatingLayerEffectsPanel
      documentController={{ setInspector: vi.fn() } as never}
      hasImage
    />
  );
  expect(markup).not.toContain('absolute');
  expect(markup).toContain('editor.floating.layer-effects-panel.back');
  expect(markup).toContain('data-inspector="layer-effects"');
  expect(markup).toContain('overflow-y-auto');
});
