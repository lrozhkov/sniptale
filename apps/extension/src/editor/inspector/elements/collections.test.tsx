// @vitest-environment jsdom
import {
  change,
  choose,
  click,
  collection,
  fixture,
  setupElements,
  state,
} from './fixture.test-support';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { EditorElementsCollections, EditorElementsDownloads } from './collections';
import { EditorElementsManagement } from './management';
import type { EditorVectorDownload } from '../../../composition/persistence/vector-elements/contracts';
const ui = setupElements();
it('preserves a refused creation draft and clears it only after a successful save', async () => {
  await ui.render(<EditorElementsCollections />);
  expect(ui.host().textContent).toContain('editor.elements.noCollections');
  expect(ui.button('editor.elements.createCollection').disabled).toBe(true);
  change(ui.input('editor.elements.collectionName'), 'My icons');
  fixture.api.createCollection.mockResolvedValueOnce(false);
  await click(ui.button('editor.elements.createCollection'));
  expect(ui.input('editor.elements.collectionName').value).toBe('My icons');
  await click(ui.button('editor.elements.createCollection'));
  expect(fixture.api.createCollection).toHaveBeenLastCalledWith('My icons');
  expect(ui.input('editor.elements.collectionName').value).toBe('');
});
it('renames a collection on blur and deletes its current incarnation', async () => {
  state().local.collections = [collection()];
  await ui.render(<EditorElementsCollections />);
  const input = ui.host().querySelectorAll<HTMLInputElement>('input')[1]!;
  change(input, '  Renamed  ');
  act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(fixture.api.renameCollection).toHaveBeenCalledWith('local', 'first', 'Renamed');
  change(input, '   ');
  act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(fixture.api.renameCollection).toHaveBeenCalledOnce();
  await click(ui.button('editor.elements.removeCollection'));
  expect(fixture.api.removeCollection).toHaveBeenCalledWith('local', 'first');
});
function download(overrides: Partial<EditorVectorDownload> = {}): EditorVectorDownload {
  return {
    key: 'download',
    kind: 'download',
    collectionId: 'local',
    collectionIncarnation: 'first',
    incarnation: 'job',
    generation: 1,
    prefix: 'sample',
    source: { sourceId: state().settings!.baseUrl, incarnation: 'source', generation: 1 },
    manifest: ['arrow', 'heart'],
    accepted: { arrow: 'id' },
    status: 'partial',
    error: null,
    ...overrides,
  };
}
it('downloads a selected collection and exposes progress cancellation and partial resume', async () => {
  await ui.render(<EditorElementsDownloads />);
  expect(ui.button('editor.elements.download').disabled).toBe(true);
  await choose(ui.button('editor.elements.collectionFilter'), 'Sample icons');
  await click(ui.button('editor.elements.download'));
  expect(fixture.api.downloadCollection).toHaveBeenCalledWith('sample');
  state().download = { prefix: 'sample', accepted: 1, total: 2, status: 'downloading' };
  await ui.render(<EditorElementsDownloads />);
  expect(ui.host().querySelector('[role=status]')?.textContent).toContain('sample: 1/2');
  expect(ui.button('editor.elements.download').disabled).toBe(true);
  await click(ui.button('editor.elements.cancelDownload'));
  expect(fixture.api.cancelDownload).toHaveBeenCalledOnce();
  state().download!.status = 'partial';
  await ui.render(<EditorElementsDownloads />);
  await click(ui.button('editor.elements.resume'));
  expect(fixture.api.downloadCollection).toHaveBeenCalledTimes(2);
  state().download!.status = 'error';
  await ui.render(<EditorElementsDownloads />);
  expect(ui.host().textContent).toContain('editor.elements.downloadError');
});
it('resumes matching saved downloads and prevents mismatched or unavailable-source retries', async () => {
  state().local.collections = [collection()];
  state().downloads = [download()];
  await ui.render(<EditorElementsDownloads />);
  expect(ui.host().textContent).toContain('My collection: 1/2');
  await click(ui.button('editor.elements.resume'));
  expect(fixture.api.downloadCollection).toHaveBeenCalledWith('sample');
  state().downloads = [download({ source: null, status: 'error' })];
  await ui.render(<EditorElementsDownloads />);
  expect(ui.button('editor.elements.resume').disabled).toBe(true);
  expect(ui.host().textContent).toContain('editor.elements.downloadError');
  state().local.collections = [];
  const legacyDownload = download({ status: 'ready' });
  delete legacyDownload.prefix;
  state().downloads = [legacyDownload];
  await ui.render(<EditorElementsDownloads />);
  expect(ui.host().textContent).toContain('local: 1/2');
  expect(ui.host().textContent).toContain('editor.elements.ready');
  expect(ui.host().textContent).not.toContain('editor.elements.resume');
});
it('shows management errors and import results, and routes preset, cache and back actions', async () => {
  state().error = true;
  state().errorCode = 'permission-required';
  state().imports = [{ name: 'icons.json', accepted: 2, declined: 1 }];
  state().local.presets = [
    {
      key: 'preset:p',
      kind: 'preset',
      id: 'p',
      name: 'Blue',
      incarnation: 'first',
      revision: 1,
      deleted: false,
      style: { kind: 'monochrome', color: '#0000ff' },
    },
  ];
  const back = vi.fn();
  await ui.render(<EditorElementsManagement onBack={back} />);
  expect(ui.host().querySelector('[role=alert]')?.textContent).toContain(
    'editor.elements.errorPermission'
  );
  expect(ui.host().textContent).toContain('icons.json');
  expect(ui.host().textContent).toContain('editor.elements.accepted: 2');
  expect(ui.host().textContent).toContain('editor.elements.declined: 1');
  await click(ui.button('editor.elements.removePreset'));
  expect(fixture.api.removePreset).toHaveBeenCalledWith('p', 'first');
  await click(ui.button('editor.elements.clearCache'));
  expect(fixture.api.clearCache).toHaveBeenCalledOnce();
  await click(ui.button('editor.elements.back'));
  expect(back).toHaveBeenCalledOnce();
});
