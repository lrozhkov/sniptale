// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
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
  expect(markup).toContain('Назад к списку слоёв');
  expect(markup).toContain('border-b');
});

it('returns to the layer list from the effects panel', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const setInspector = vi.fn();

  act(() => {
    root.render(
      <EditorFloatingLayerEffectsPanel documentController={{ setInspector } as never} hasImage />
    );
  });
  act(() => {
    host
      .querySelector<HTMLButtonElement>('[data-ui="editor.floating.layer-effects-panel.back"]')
      ?.click();
  });

  expect(setInspector).toHaveBeenCalledWith('tool');
  act(() => root.unmount());
});
