// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const lazyPopupCommandPaletteMock = vi.hoisted(() =>
  vi.fn((props: { isOpen: boolean; onClose: () => void; runtime: unknown }) => (
    <div data-ui="popup.command-palette" data-open={String(props.isOpen)} />
  ))
);

vi.mock('../lazy-chunks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lazy-chunks')>()),
  LazyPopupCommandPalette: (props: Parameters<typeof lazyPopupCommandPaletteMock>[0]) =>
    lazyPopupCommandPaletteMock(props),
}));

import { CommandPaletteLayer } from './command-palette-layer';

describe('CommandPaletteLayer', () => {
  it('does not render the lazy command palette when closed', () => {
    const markup = renderToStaticMarkup(
      <CommandPaletteLayer isOpen={false} onClose={vi.fn()} runtime={undefined as never} />
    );

    expect(markup).toBe('');
    expect(lazyPopupCommandPaletteMock).not.toHaveBeenCalled();
  });

  it('renders the lazy command palette when open', () => {
    const markup = renderToStaticMarkup(
      <CommandPaletteLayer isOpen={true} onClose={vi.fn()} runtime={undefined as never} />
    );

    expect(markup).toContain('popup.command-palette');
    expect(markup).toContain('data-open="true"');
    expect(lazyPopupCommandPaletteMock).toHaveBeenCalledTimes(1);
  });
});
