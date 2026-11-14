// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  EditorVectorLibraryProvider,
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
  useOptionalEditorVectorLibrarySession,
} from './context';
import type { EditorVectorLibrarySession } from './session';

vi.mock('../../../composition/persistence/vector-elements', () => ({
  createEditorVectorLibrary: vi.fn(() => ({})),
  createEditorVectorDownloads: vi.fn(() => ({})),
  createEditorVectorCache: vi.fn(() => ({})),
}));
vi.mock('../../vector-elements/catalog-client', () => ({
  createEditorVectorCatalogClient: vi.fn(() => ({})),
  requestEditorVectorCatalogPermission: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

it('exposes an absent optional session and rejects required hooks outside the provider', () => {
  function Optional() {
    return <span>{useOptionalEditorVectorLibrarySession() === null ? 'absent' : 'present'}</span>;
  }
  function Required() {
    useEditorVectorLibrarySession();
    return null;
  }
  expect(renderToString(<Optional />)).toContain('absent');
  expect(() => renderToString(<Required />)).toThrow('Vector library provider is missing.');
});

it('owns the default session lifetime and keeps an injected session under its caller ownership', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let observed: EditorVectorLibrarySession | undefined;
  function Consumer() {
    observed = useEditorVectorLibrarySession();
    const snapshot = useEditorVectorLibrarySnapshot();
    return <span>{snapshot.scrollTop}</span>;
  }
  await act(async () =>
    root.render(
      <EditorVectorLibraryProvider>
        <Consumer />
      </EditorVectorLibraryProvider>
    )
  );
  if (!observed) throw new Error('Missing provider session.');
  const owned = observed;
  const dispose = vi.spyOn(owned, 'dispose');
  await act(async () => owned.setScroll(42));
  expect(host.textContent).toBe('42');
  await act(async () => root.render(null));
  expect(dispose).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(
      <EditorVectorLibraryProvider>
        <Consumer />
      </EditorVectorLibraryProvider>
    )
  );
  const external = observed;
  expect(external).not.toBe(owned);
  const externalDispose = vi.spyOn(external, 'dispose').mockImplementation(() => {});
  await act(async () => root.render(null));
  externalDispose.mockClear();
  await act(async () =>
    root.render(
      <EditorVectorLibraryProvider session={external}>
        <Consumer />
      </EditorVectorLibraryProvider>
    )
  );
  expect(observed).toBe(external);
  await act(async () => root.unmount());
  expect(externalDispose).not.toHaveBeenCalled();
});
