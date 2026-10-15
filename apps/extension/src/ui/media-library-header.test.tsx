// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MediaLibraryHeader } from './media-library-header';

vi.mock('../platform/i18n', () => ({ translate: (key: string) => key }));
it('shares search, grouped filter and borderless close while keeping query callbacks controlled', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(),
    apply = vi.fn(),
    composing = vi.fn(),
    close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <MediaLibraryHeader
          title="Library"
          dataUi="test.library"
          searchLabel="Find media"
          filterLabel="Filter media"
          menuClassName="sniptale-parameter-menu"
          query=""
          onQueryChange={change}
          onApplyQuery={apply}
          onComposingChange={composing}
          viewId="saved"
          onViewChange={vi.fn()}
          options={[
            { value: '', label: 'All images' },
            { value: 'saved', label: 'Backgrounds', group: 'All images' },
          ]}
          onClose={close}
        />
      )
    );
    const search = host.querySelector<HTMLInputElement>('input')!;
    const filter = host.querySelector('[aria-label="Filter media"]')!;
    expect(search.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filter.getAttribute('title')).toBe('All images: Backgrounds');
    await act(async () => (filter as HTMLButtonElement).click());
    expect(document.querySelector('[role="listbox"]')?.className).toContain(
      'sniptale-parameter-menu'
    );
    await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        'sky'
      );
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith('sky');
    expect(apply).toHaveBeenCalledOnce();
    const button = host.querySelector<HTMLButtonElement>('[aria-label="common.actions.close"]')!;
    expect(button.className).toContain('!border-0');
    act(() => button.click());
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
