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
vi.mock('./surface-styles/view', () => ({
  SurfaceStylePresetsSettings: () => <div>surfaces-owner</div>,
}));
vi.mock('./gradients/view', () => ({
  GradientPresetsSettings: () => <div>gradients-owner</div>,
}));
vi.mock('./backgrounds/view', () => ({
  BackgroundPresetsSettings: () => <div>backgrounds-owner</div>,
}));
import { EditorResourcesContent } from './content';
it('shows palettes without the removed Tools tab', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<EditorResourcesContent view="palettes" />));
  expect(node.textContent).toContain('palettes-owner');
  expect(node.textContent).not.toContain('tools-owner');
  expect(node.textContent).not.toContain('settings.navigation.views.tools');
  act(() => root.unmount());
});

it.each([
  ['surfaces', 'surfaces-owner'],
  ['gradients', 'gradients-owner'],
  ['backgrounds', 'backgrounds-owner'],
] as const)('renders %s as an independent resource subpage', (view, owner) => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<EditorResourcesContent view={view} />));
  expect(node.textContent).toContain(owner);
  expect(node.textContent).not.toContain('tools-owner');
  expect(node.textContent).not.toContain('palettes-owner');
  act(() => root.unmount());
});

it.each(['tools', 'unknown', undefined])(
  'resolves %s to palettes and forwards visible navigation',
  (view) => {
    const onViewChange = vi.fn();
    const node = document.createElement('div');
    const root = createRoot(node);
    act(() =>
      root.render(
        <EditorResourcesContent
          {...(view === undefined ? {} : { view })}
          onViewChange={onViewChange}
        />
      )
    );
    expect(node.textContent).toContain('palettes-owner');
    expect(node.textContent).not.toContain('tools-owner');
    expect(node.textContent).not.toContain('settings.navigation.views.tools');
    expect(node.querySelector('[aria-current="page"]')?.textContent).toBe(
      'settings.navigation.views.palettes'
    );
    act(() => node.querySelectorAll('button')[1]?.click());
    expect(onViewChange).toHaveBeenCalledWith('surfaces');
    act(() => root.unmount());
  }
);
