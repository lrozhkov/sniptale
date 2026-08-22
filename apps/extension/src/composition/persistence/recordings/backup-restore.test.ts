import { expect, it, vi } from 'vitest';
import type { RecordingTelemetryEntry } from './contracts';
import { putRecordingBackupRestore } from './backup-restore';

it('publishes recording ref, owner, metadata, and telemetry through caller stores', async () => {
  const stores = { owner: vi.fn(), ref: vi.fn(), recording: vi.fn(), telemetry: vi.fn() };
  const ref = {
    assetId: 'asset',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/asset' },
    mimeType: 'video/webm',
    sha256: null,
    size: 4,
  };
  const entry = {
    assetId: 'asset',
    createdAt: 1,
    filename: 'clip.webm',
    id: 'recording',
    mimeType: 'video/webm',
    size: 4,
  };
  await putRecordingBackupRestore({
    entry,
    ownerStore: { put: stores.owner },
    ref,
    refStore: { put: stores.ref },
    recordingStore: { put: stores.recording },
    telemetryStore: { put: stores.telemetry },
  });
  expect(stores.ref).toHaveBeenCalledWith(ref);
  expect(stores.owner).toHaveBeenCalledWith({
    assetId: 'asset',
    ownerId: 'recording',
    ownerKind: 'recording',
    role: 'body',
  });
  expect(stores.recording).toHaveBeenCalledWith(entry);
  expect(stores.telemetry).not.toHaveBeenCalled();
});

it('publishes optional recording telemetry in the same caller transaction', async () => {
  const stores = { owner: vi.fn(), ref: vi.fn(), recording: vi.fn(), telemetry: vi.fn() };
  const ref = {
    assetId: 'asset',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/asset' },
    mimeType: 'video/webm',
    sha256: null,
    size: 4,
  };
  const entry = {
    assetId: 'asset',
    createdAt: 1,
    filename: 'clip.webm',
    id: 'recording',
    mimeType: 'video/webm',
    size: 4,
  };
  const telemetry = {
    actionEvents: [],
    captureMode: null,
    createdAt: 1,
    cursorTrack: null,
    recordingId: 'recording',
    signals: [],
    updatedAt: 1,
    viewport: null,
  } satisfies RecordingTelemetryEntry;

  await putRecordingBackupRestore({
    entry,
    ownerStore: { put: stores.owner },
    ref,
    refStore: { put: stores.ref },
    recordingStore: { put: stores.recording },
    telemetry,
    telemetryStore: { put: stores.telemetry },
  });

  expect(stores.telemetry).toHaveBeenCalledWith(telemetry);
});
