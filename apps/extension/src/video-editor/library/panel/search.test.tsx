// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { LibraryPanelSearch } from './search';

it('clears the scoped media query through native input and retains focus', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Search() {
    const [query, setQuery] = useState('screen');
    return (
      <InspectorLayout>
        <LibraryPanelSearch query={query} onQueryChange={setQuery} />
      </InspectorLayout>
    );
  }
  try {
    act(() => root.render(<Search />));
    const input = host.querySelector<HTMLInputElement>('input')!;
    expect(input.type).toBe('search');
    expect(input.value).toBe('screen');
    act(() => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('.sniptale-field-clear')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('keeps the pending library search construction outside the migrated scope', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() => root.render(<LibraryPanelSearch query="screen" onQueryChange={() => {}} />));
    expect(host.querySelector('.video-library-search')).toBeNull();
    expect(host.querySelector('label[for="video-editor-library-search"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
