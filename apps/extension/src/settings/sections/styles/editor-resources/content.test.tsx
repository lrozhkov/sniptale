// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./tools/view', () => ({ ToolPresetsSettings: () => <div>tools-owner</div> }));
vi.mock('./palettes/view', () => ({ PalettesSettings: () => <div>palettes-owner</div> }));
import { EditorResourcesContent } from './content';
it('composes tools and palettes as route-controlled subpages', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<EditorResourcesContent view="palettes" />));
  expect(node.textContent).toContain('palettes-owner');
  expect(node.textContent).not.toContain('tools-owner');
  act(() => root.unmount());
});

it('falls back to tools and forwards route navigation', () => {
  const onViewChange = vi.fn();
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<EditorResourcesContent view="unknown" onViewChange={onViewChange} />));
  expect(node.textContent).toContain('tools-owner');
  act(() => node.querySelectorAll('button')[1]?.click());
  expect(onViewChange).toHaveBeenCalledWith('palettes');
  act(() => root.unmount());
});
