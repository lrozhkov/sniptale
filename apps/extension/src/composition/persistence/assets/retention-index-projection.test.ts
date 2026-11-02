import { describe, expect, it } from 'vitest';
import { projectRetentionRow, projectRowReferenceKeys } from './retention-index-projection';
import {
  ROW_REFERENCE_FIELD,
  UNKNOWN_ASSET_REFERENCES,
  UNKNOWN_MEDIA_REFERENCES,
  rowReferenceKey,
  stripRowReferenceMetadata,
  withRowReferenceMetadata,
} from '../infrastructure/indexed-db/row-index-contract';

const projectAsset = {
  id: 'private',
  assetId: 'bytes',
  createdAt: 1,
  mimeType: 'image/png',
  size: 3,
};
const project = (source: unknown) => ({
  project: {
    version: 5,
    baseRecordingId: null,
    source: { kind: 'manual' },
    assets: [{ source }],
    invalidPresentation: true,
  },
});

describe('native deletion reference projection', () => {
  it('retains private acquisition bytes and origin membership before an editor save', () => {
    const raw = { ...projectAsset, originMediaId: 'media:origin' };
    expect(projectRetentionRow('project_assets', raw)).toMatchObject({
      valid: true,
      owners: [{ ownerKind: 'project-asset', ownerId: 'private', assetId: 'bytes', role: 'body' }],
    });
    expect(projectRowReferenceKeys('project_assets', raw)).toEqual(
      expect.arrayContaining(['asset:bytes', 'media:media:origin'])
    );
  });

  it.each([
    'recordings',
    'project_assets',
    'project_exports',
    'scenario_assets',
    'scenario_exports',
    'scenario_step_editor_documents',
    'image_workspaces',
    'web_snapshots',
    'media_library',
    'asset_refs',
    'asset_owners',
    'asset_operations',
    'sync_capture',
  ])('retains bytes when %s has unknown physical claims', (store) => {
    expect(projectRowReferenceKeys(store, { invalid: true })).toContain(UNKNOWN_ASSET_REFERENCES);
  });

  it('indexes frozen origins even when unrelated presentation fields are invalid', () => {
    expect(
      projectRowReferenceKeys(
        'video_projects',
        project({
          kind: 'project-asset',
          projectAssetId: 'private',
          originMediaId: 'original',
          originRecordingId: 'capture',
        })
      )
    ).toEqual(['project-asset:private', 'media:original', 'recording:capture']);
  });

  it('protects primary recordings even when they have no timeline placements', () => {
    expect(
      projectRowReferenceKeys('video_projects', {
        project: {
          version: 5,
          baseRecordingId: 'base',
          source: { kind: 'recording', recordingId: 'primary' },
          assets: [],
        },
      })
    ).toEqual(['recording:base', 'recording:primary']);
  });

  it('retains unknown source envelopes rather than publishing false empty keys', () => {
    expect(
      projectRowReferenceKeys('video_projects', project({ kind: 'future-source', id: 'x' }))
    ).toContain(UNKNOWN_MEDIA_REFERENCES);
    expect(
      projectRowReferenceKeys(
        'project_export_inputs',
        project({ kind: 'library-asset', mediaId: '' })
      )
    ).toContain(UNKNOWN_MEDIA_REFERENCES);
    expect(
      projectRowReferenceKeys('project_assets', { ...projectAsset, originMediaId: null })
    ).toContain(UNKNOWN_MEDIA_REFERENCES);
  });

  it('indexes detached export inputs by the same complete dependency envelope', () => {
    expect(
      projectRowReferenceKeys(
        'project_export_inputs',
        project({ kind: 'library-asset', mediaId: 'detached' })
      )
    ).toEqual(['media:detached']);
  });

  it('includes borrowed, frozen and canonical scenario identities without conflating byte IDs', () => {
    const raw = {
      id: 'child',
      assetId: 'shared-bytes',
      galleryAssetId: 'frozen',
      borrowedMediaId: 'borrowed',
    };
    const keys = projectRowReferenceKeys('scenario_assets', raw);
    expect(keys).toContain('media:frozen');
    expect(keys).toContain('media:borrowed');
    expect(keys).not.toContain('media:shared-bytes');
    expect(
      projectRowReferenceKeys('scenario_assets', { ...raw, borrowedMediaId: undefined })
    ).toContain('media:scenario-asset:child');
  });

  it('replaces forged projection metadata and preserves every other portable field', () => {
    const raw = {
      ...projectAsset,
      future: { payload: [1, 2] },
      [ROW_REFERENCE_FIELD]: ['asset:forged'],
    };
    const indexed = withRowReferenceMetadata(raw, projectRowReferenceKeys('project_assets', raw));
    expect(indexed).not.toEqual(
      expect.objectContaining({ [ROW_REFERENCE_FIELD]: ['asset:forged'] })
    );
    expect(stripRowReferenceMetadata(indexed)).toEqual({
      ...projectAsset,
      future: { payload: [1, 2] },
    });
    expect(raw[ROW_REFERENCE_FIELD]).toEqual(['asset:forged']);
  });

  it('keeps complete identities separate across namespaces', () => {
    expect(rowReferenceKey('media', 'asset:a:b')).not.toBe(rowReferenceKey('asset', 'media:a:b'));
    expect(rowReferenceKey('media', 'a:b')).not.toBe(rowReferenceKey('media', 'a'));
  });
});

it('preserves a legacy empty base recording identity in the conservative locator', () => {
  expect(
    projectRowReferenceKeys('video_projects', {
      project: {
        version: 5,
        baseRecordingId: '',
        source: { kind: 'manual' },
        assets: [],
      },
    })
  ).toContain('recording:');
});
