import { describe, expect, it } from 'vitest';
import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import { decodePortableEditorDocument, encodePortableEditorDocument } from './editor-document';

const baseDocument = createPersistedEditorDocumentFixture(
  createEditorDocumentFixture(),
  'source-local'
);
const document = {
  ...baseDocument,
  assets: [
    { assetId: 'source-local', role: 'source-image' },
    { assetId: 'canvas-local', role: 'canvas:$.objects[0].src' },
  ],
  canvasJson: JSON.stringify({ objects: [{ src: 'sniptale-asset:canvas-local' }] }),
};

describe('portable editor document codec', () => {
  it('replaces pointers and schema-owned canvas URLs without embedded local IDs', () => {
    const portable = encodePortableEditorDocument({
      document,
      objectsByAssetId: new Map([
        ['source-local', 'object-source'],
        ['canvas-local', 'object-canvas'],
      ]),
    });
    expect(portable.sourceImage).toEqual({ objectId: 'object-source' });
    expect(portable.assets).toEqual([
      { objectId: 'object-source', role: 'source-image' },
      { objectId: 'object-canvas', role: 'canvas:$.objects[0].src' },
    ]);
    expect(portable.canvasJson).toContain('sniptale-object:object-canvas');
    expect(JSON.stringify(portable)).not.toContain('assetId');
    expect(JSON.stringify(portable)).not.toContain('canvas-local');
    expect(
      decodePortableEditorDocument({
        document: portable,
        assetsByObjectId: new Map([
          ['object-source', 'restored-source'],
          ['object-canvas', 'restored-canvas'],
        ]),
      })
    ).toMatchObject({
      sourceImage: { assetId: 'restored-source' },
      assets: [
        { assetId: 'restored-source', role: 'source-image' },
        { assetId: 'restored-canvas', role: 'canvas:$.objects[0].src' },
      ],
    });
  });

  it('fails when any declared pointer lacks an archive object', () => {
    expect(() =>
      encodePortableEditorDocument({
        document,
        objectsByAssetId: new Map([['source-local', 'object-source']]),
      })
    ).toThrow('missing from archive inventory');
  });

  it('returns the exact restored projection without portable unknown keys', () => {
    const portable = encodePortableEditorDocument({
      document,
      objectsByAssetId: new Map([
        ['source-local', 'object-source'],
        ['canvas-local', 'object-canvas'],
      ]),
    });
    const hostilePortable = {
      ...portable,
      ignoredDocumentField: true,
      frame: { ...portable.frame, ignoredFrameField: true },
    };

    const decoded = decodePortableEditorDocument({
      document: hostilePortable,
      assetsByObjectId: new Map([
        ['object-source', 'restored-source'],
        ['object-canvas', 'restored-canvas'],
      ]),
    });

    expect(decoded).not.toHaveProperty('ignoredDocumentField');
    expect(decoded.frame).not.toHaveProperty('ignoredFrameField');
  });
});
