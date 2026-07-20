import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';

const getRecordingMock = vi.fn();
const saveProjectAssetSafelyMock = vi.fn();
const loadAudioMetadataMock = vi.fn();
const loadImageMetadataMock = vi.fn();
const loadVideoMetadataMock = vi.fn();
const projectAssetId = '00000000-0000-4000-8000-000000000001';

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  getRecording: getRecordingMock,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveProjectAssetSafely: saveProjectAssetSafelyMock,
}));

vi.mock('../media-metadata', () => ({
  loadAudioMetadata: loadAudioMetadataMock,
  loadImageMetadata: loadImageMetadataMock,
  loadVideoMetadata: loadVideoMetadataMock,
}));

describe('project asset helpers', () => {
  beforeEach(setupProjectAssetHelpersTest);

  it('copies recording assets into project-owned storage', verifyRecordingAssetCopy);

  it('rejects oversized image imports before metadata loading starts', verifyOversizedImport);

  it('rejects mismatched declared media types before metadata loading starts', verifyMimeMismatch);

  it('rejects mismatched media signatures before metadata loading starts', verifyMagicMismatch);

  it('rejects same-category MIME spoofing before metadata loading starts', verifySubtypeMismatch);

  it('imports image assets within the supported size limit', verifyImageImport);

  it(
    'imports AVIF, video, and audio assets after MIME and signature validation',
    verifyMediaImports
  );
});

function setupProjectAssetHelpersTest() {
  vi.clearAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(projectAssetId);
  loadImageMetadataMock.mockResolvedValue({
    width: 320,
    height: 180,
    duration: null,
    mimeType: 'image/png',
    size: 1024,
    hasAudio: false,
    audioPeaks: null,
  });
  loadVideoMetadataMock.mockResolvedValue({
    width: 1920,
    height: 1080,
    duration: 12,
    mimeType: 'video/webm',
    size: 2048,
    hasAudio: true,
    audioPeaks: [0.2, 0.7],
  });
  loadAudioMetadataMock.mockResolvedValue({
    duration: 5,
    mimeType: 'audio/mpeg',
    size: 1024,
    hasAudio: true,
    audioPeaks: [0.3, 0.8],
  });
}

function createImportFile(bytes: Uint8Array, name: string, type: string): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new File([buffer], name, { type });
}

function createPngFile(name = 'image.png'): File {
  return createImportFile(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    name,
    'image/png'
  );
}

function createAvifFile(name = 'image.avif'): File {
  return createImportFile(
    Uint8Array.of(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66),
    name,
    'image/avif'
  );
}

function createWebmFile(name = 'clip.webm', type = 'video/webm'): File {
  return createImportFile(Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3), name, type);
}

function createRecordedWebmAudioFile(): File {
  return createWebmFile('voice.webm', 'audio/webm;codecs=opus');
}

function createMp3File(name = 'sound.mp3'): File {
  return createImportFile(Uint8Array.of(0x49, 0x44, 0x33, 0x03), name, 'audio/mpeg');
}

function expectNoImportSideEffects() {
  expect(loadAudioMetadataMock).not.toHaveBeenCalled();
  expect(loadImageMetadataMock).not.toHaveBeenCalled();
  expect(loadVideoMetadataMock).not.toHaveBeenCalled();
  expect(saveProjectAssetSafelyMock).not.toHaveBeenCalled();
}

function mockRecordingEntry(): Blob {
  const recordingBlob = new Blob(['video'], { type: 'video/webm' });

  getRecordingMock.mockResolvedValue({
    blob: recordingBlob,
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    size: 2048,
  });
  loadVideoMetadataMock.mockResolvedValue({
    width: 1920,
    height: 1080,
    duration: 12,
    mimeType: 'video/webm',
    size: 2048,
    hasAudio: true,
    audioPeaks: [0.2, 0.7],
  });
  return recordingBlob;
}

async function verifyRecordingAssetCopy() {
  const { ensureRecordingAsset } = await import('./assets');
  const recordingBlob = mockRecordingEntry();
  const project = createEmptyVideoProject('Recording copy');

  const asset = await ensureRecordingAsset(project, 'recording-1');

  expect(saveProjectAssetSafelyMock).toHaveBeenCalledWith(
    projectAssetId,
    recordingBlob,
    'video/webm',
    'recording.webm'
  );
  expect(asset).toEqual(
    expect.objectContaining({
      type: VideoProjectAssetType.RECORDING,
      source: {
        kind: 'project-asset',
        projectAssetId,
        originRecordingId: 'recording-1',
      },
    })
  );
}

async function verifyOversizedImport() {
  const { importProjectAsset } = await import('./assets');
  const file = createPngFile('huge.png');
  Object.defineProperty(file, 'size', {
    configurable: true,
    value: 64 * 1024 * 1024 + 1,
  });

  await expect(importProjectAsset(file, VideoProjectAssetType.IMAGE)).rejects.toThrow(
    translate('videoEditor.app.importAssetTooLarge')
  );
  expectNoImportSideEffects();
}

async function verifyMimeMismatch() {
  const { importProjectAsset } = await import('./assets');
  const file = createImportFile(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    'clip.png',
    'video/webm'
  );

  await expect(importProjectAsset(file, VideoProjectAssetType.IMAGE)).rejects.toThrow(
    translate('videoEditor.app.importAssetUnsupported')
  );
  expectNoImportSideEffects();
}

async function verifyMagicMismatch() {
  const { importProjectAsset } = await import('./assets');
  const file = createImportFile(Uint8Array.of(0x74, 0x65, 0x78, 0x74), 'image.png', 'image/png');

  await expect(importProjectAsset(file, VideoProjectAssetType.IMAGE)).rejects.toThrow(
    translate('videoEditor.app.importAssetUnsupported')
  );
  expectNoImportSideEffects();
}

async function verifySubtypeMismatch() {
  const { importProjectAsset } = await import('./assets');
  const spoofedImage = createImportFile(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    'image.jpg',
    'image/jpeg'
  );
  const spoofedVideo = createWebmFile('clip.mp4', 'video/mp4');
  const spoofedAudio = createImportFile(
    Uint8Array.of(0x49, 0x44, 0x33, 0x03),
    'sound.wav',
    'audio/wav'
  );

  await expect(importProjectAsset(spoofedImage, VideoProjectAssetType.IMAGE)).rejects.toThrow(
    translate('videoEditor.app.importAssetUnsupported')
  );
  await expect(importProjectAsset(spoofedVideo, VideoProjectAssetType.VIDEO)).rejects.toThrow(
    translate('videoEditor.app.importAssetUnsupported')
  );
  await expect(importProjectAsset(spoofedAudio, VideoProjectAssetType.AUDIO)).rejects.toThrow(
    translate('videoEditor.app.importAssetUnsupported')
  );
  expectNoImportSideEffects();
}

async function verifyImageImport() {
  const { importProjectAsset } = await import('./assets');
  const file = createPngFile();

  const asset = await importProjectAsset(file, VideoProjectAssetType.IMAGE);

  expect(loadImageMetadataMock).toHaveBeenCalledWith(file);
  expect(saveProjectAssetSafelyMock).toHaveBeenCalledWith(
    projectAssetId,
    file,
    'image/png',
    'image.png'
  );
  expect(asset).toEqual(
    expect.objectContaining({
      name: 'image.png',
      type: VideoProjectAssetType.IMAGE,
      source: {
        kind: 'project-asset',
        projectAssetId,
      },
    })
  );
}

async function verifyMediaImports() {
  const { importProjectAsset } = await import('./assets');
  const avifFile = createAvifFile();
  const videoFile = createWebmFile();
  const audioFile = createMp3File();
  const recordedAudioFile = createRecordedWebmAudioFile();

  const avifAsset = await importProjectAsset(avifFile, VideoProjectAssetType.IMAGE);
  const videoAsset = await importProjectAsset(videoFile, VideoProjectAssetType.VIDEO);
  const audioAsset = await importProjectAsset(audioFile, VideoProjectAssetType.AUDIO);
  await importProjectAsset(recordedAudioFile, VideoProjectAssetType.AUDIO);

  expect(loadImageMetadataMock).toHaveBeenCalledWith(avifFile);
  expect(loadVideoMetadataMock).toHaveBeenCalledWith(videoFile);
  expect(loadAudioMetadataMock).toHaveBeenCalledWith(audioFile);
  expect(loadAudioMetadataMock).toHaveBeenCalledWith(recordedAudioFile);
  expect(saveProjectAssetSafelyMock).toHaveBeenCalledWith(
    projectAssetId,
    videoFile,
    'video/webm',
    'clip.webm'
  );
  expect(saveProjectAssetSafelyMock).toHaveBeenCalledWith(
    projectAssetId,
    audioFile,
    'audio/mpeg',
    'sound.mp3'
  );
  expect(saveProjectAssetSafelyMock).toHaveBeenCalledWith(
    projectAssetId,
    recordedAudioFile,
    'audio/mpeg',
    'voice.webm'
  );
  expect(avifAsset.type).toBe(VideoProjectAssetType.IMAGE);
  expect(videoAsset.type).toBe(VideoProjectAssetType.VIDEO);
  expect(audioAsset.type).toBe(VideoProjectAssetType.AUDIO);
}
