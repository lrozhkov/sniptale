import { expect, it } from 'vitest';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectExportEntry } from '../projects/read-guards';
import { parseMediaLibraryEntry } from './read-guards';
import { buildProjectExportMediaEntry, buildRecordingMediaEntry } from './entry-mapping';

const recordingMetadata = {
  captureMode: 'TAB' as const,
  displaySurface: 'browser' as const,
  actionCount: 4,
  hasPointer: true,
};
const original = {
  id: 'copy',
  assetId: 'bytes',
  filename: 'copy.webm',
  createdAt: 1,
  mimeType: 'video/webm',
  size: 8,
};
const exportEntry = {
  ...original,
  projectId: 'project',
  width: 320,
  height: 180,
  fps: 15,
  duration: 3,
};

it.each(['recording', 'project-export'] as const)(
  'keeps frozen metadata through %s parsing and library reconstruction',
  (kind) => {
    const raw = { ...recordingMetadata, sourceUrl: 'private', actionEvents: [{ text: 'private' }] };
    const media =
      kind === 'recording'
        ? buildRecordingMediaEntry(
            parseRecordingEntry({
              ...original,
              recordingMetadata: raw,
              mediaMetadata: { kind: 'video', width: 320, height: 180, duration: 3 },
            })!
          )
        : buildProjectExportMediaEntry(
            parseProjectExportEntry({ ...exportEntry, recordingMetadata: raw })!
          );
    const reopened = parseMediaLibraryEntry(JSON.parse(JSON.stringify(media)));
    expect(reopened?.recordingMetadata).toEqual(recordingMetadata);
    expect(reopened).toMatchObject({ width: 320, height: 180, duration: 3, size: 8 });
    expect(reopened?.sourceUrl).toBeNull();
    expect(
      parseMediaLibraryEntry({ ...media, recordingMetadata: { ...raw, actionCount: -1 } })
    ).toBeNull();
  }
);
it('keeps legacy absence and rejects invalid acquisition snapshots at each boundary', () => {
  expect(parseRecordingEntry(original)).not.toHaveProperty('recordingMetadata');
  expect(parseProjectExportEntry(exportEntry)).not.toHaveProperty('recordingMetadata');
  expect(
    parseRecordingEntry({
      ...original,
      recordingMetadata: { ...recordingMetadata, hasPointer: 'yes' },
    })
  ).toBeNull();
  expect(
    parseProjectExportEntry({
      ...exportEntry,
      recordingMetadata: { ...recordingMetadata, captureMode: 'unknown' },
    })
  ).toBeNull();
});
