import { expect, it } from 'vitest';
import { imageWorkspaceAssetBindings } from './assets';
import type { PersistedImageHistory } from './history-contracts';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  type EditorDocument,
} from '../../../features/editor/document/public';
import { IMAGE_HISTORY_VALUE_TOKEN_PREFIX } from '../../../features/editor-history/image-snapshot';

const source: EditorDocument = {
  version: 2,
  sourceImageData: 'data:image/png;base64,QUJDRA==',
  sourceName: null,
  sourceWidth: 1,
  sourceHeight: 1,
  canvasWidth: 1,
  canvasHeight: 1,
  sourceLeft: 0,
  sourceTop: 0,
  sourceDisplayWidth: 1,
  sourceDisplayHeight: 1,
  frame: { ...DEFAULT_EDITOR_FRAME_SETTINGS },
  canvasJson: '{"objects":[]}',
};

const valueId = IMAGE_HISTORY_VALUE_TOKEN_PREFIX + '0';
const history: PersistedImageHistory = {
  version: 1,
  epoch: 'assets',
  cursor: 0,
  snapshots: [{ assetId: 'snapshot' }],
  values: [{ id: valueId, kind: 'json', assetId: 'shared' }],
  actions: [null],
};

it('retains a shared resource under each current and historical ownership role', () => {
  const document = createPersistedEditorDocumentFixture(source, 'shared');
  expect(imageWorkspaceAssetBindings({ document, history })).toEqual([
    { assetId: 'shared', role: 'source-image' },
    { assetId: 'snapshot', role: 'history:snapshot:snapshot' },
    { assetId: 'shared', role: `history:value:${valueId}` },
  ]);
  expect(imageWorkspaceAssetBindings({ document })).toEqual(document.assets);
});

it('refuses conflicting current and historical roles without changing either resource graph', () => {
  const document = createPersistedEditorDocumentFixture(source, 'current');
  document.assets = [{ assetId: 'current', role: 'history:snapshot:snapshot' }];
  const before = structuredClone({ document, history });
  expect(() => imageWorkspaceAssetBindings({ document, history })).toThrow('asset roles conflict');
  expect({ document, history }).toEqual(before);
});
