import { expect, it } from 'vitest';
import {
  assertCursorAttachmentLayout,
  assertReviewProjectLayout,
  hasCursorAttachmentMetadata,
  isSharedBackupLayout,
  resolveMediaHubBackupMetadataLayout,
  MEDIA_HUB_BACKUP_CURSOR_LAYOUT,
} from './layout';
import { buildMediaHubBackupExportPlanV6 } from './export';
import { parseManifestV6 } from './codec';
import { parseBackupRootEnvelope } from './shared-object-envelope';

it.each([
  'library-folders-v1',
  'library-folders-v2',
  'library-folders-v3',
  'library-folders-v4',
] as const)('refuses root-owned cursor attachments under %s', (layout) => {
  for (const metadata of [
    { cursorAttachments: [] },
    { recording: { cursorAttachment: {} } },
    { recording: { eventsAttachment: {} } },
  ])
    expect(() => assertCursorAttachmentLayout(metadata, layout)).toThrow(
      'require library-folders-v5'
    );
  expect(() => assertCursorAttachmentLayout({ entry: { id: 'ordinary' } }, layout)).not.toThrow();
});

it('uses explicit root fields rather than arbitrary authored JSON as its format marker', () => {
  expect(
    hasCursorAttachmentMetadata({ project: { textDocuments: [{ cursorAttachments: [] }] } })
  ).toBe(false);
  expect(hasCursorAttachmentMetadata({ data: { format: 'cursor-trajectory-v1' } })).toBe(false);
  expect(hasCursorAttachmentMetadata({ cursorAttachments: [] })).toBe(true);
  expect(hasCursorAttachmentMetadata({ recording: { cursorAttachment: {} } })).toBe(true);
  expect(hasCursorAttachmentMetadata({ recording: { eventsAttachment: {} } })).toBe(true);
  expect(
    hasCursorAttachmentMetadata({ project: { textDocuments: [{ eventsAttachment: {} }] } })
  ).toBe(false);
});

it('selects v5 without downgrading it when another root has authoritative review project metadata', () => {
  const history = { cursorAttachments: [] };
  const review = { videoReview: { workspace: { project: {} } } };
  expect(resolveMediaHubBackupMetadataLayout('library-folders-v3', {})).toBe('library-folders-v3');
  expect(resolveMediaHubBackupMetadataLayout('library-folders-v3', review)).toBe(
    'library-folders-v4'
  );
  expect(resolveMediaHubBackupMetadataLayout('library-folders-v3', history)).toBe(
    MEDIA_HUB_BACKUP_CURSOR_LAYOUT
  );
  expect(resolveMediaHubBackupMetadataLayout(MEDIA_HUB_BACKUP_CURSOR_LAYOUT, review)).toBe(
    MEDIA_HUB_BACKUP_CURSOR_LAYOUT
  );
  expect(() => assertReviewProjectLayout(review, MEDIA_HUB_BACKUP_CURSOR_LAYOUT)).not.toThrow();
  expect(() => assertCursorAttachmentLayout(history, MEDIA_HUB_BACKUP_CURSOR_LAYOUT)).not.toThrow();
});

it('admits v5 through the manifest and shared envelope reader while refusing history relabelled as v3', () => {
  const plan = buildMediaHubBackupExportPlanV6({
    layout: MEDIA_HUB_BACKUP_CURSOR_LAYOUT,
    roots: [],
    privacy: { includeSourceMetadata: true, includeTelemetry: true, includeWebSnapshots: false },
  });
  const manifest = parseManifestV6({ ...plan.manifest, sharedObjects: [] });
  expect(isSharedBackupLayout(manifest.layout)).toBe(true);
  const envelope = {
    descriptor: {
      rootKind: 'media',
      mediaSubtype: 'library-item',
      rootId: 'recording:test',
      metadataPath: '_sniptale/metadata/media/test.json',
      objectCount: 0,
      totalBytes: 0,
    },
    metadata: { cursorAttachments: [] },
    objects: [],
  };
  expect(
    parseBackupRootEnvelope(envelope, { ...manifest, sharedObjects: [] }).envelope.metadata
  ).toEqual(envelope.metadata);
  expect(() =>
    parseBackupRootEnvelope(envelope, {
      ...manifest,
      layout: 'library-folders-v3',
      sharedObjects: [],
    })
  ).toThrow('require library-folders-v5');
  expect(() => parseManifestV6({ ...manifest, layout: 'library-folders-v6' })).toThrow(
    'Unsupported'
  );
});
