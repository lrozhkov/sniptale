import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types';

const getRecordingMock = vi.fn();
const getMediaLibraryEntryMock = vi.fn();
const getMediaAssetBlobMock = vi.fn();
const getAggregatePresentationMock = vi.fn();
const saveProjectAssetSafelyMock = vi.fn();
const deleteProjectAssetMock = vi.fn();
const loadAudioMetadataMock = vi.fn();
const loadImageMetadataMock = vi.fn();
const loadVideoMetadataMock = vi.fn();
const projectAssetId = '00000000-0000-4000-8000-000000000001';

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  deleteProjectAsset: deleteProjectAssetMock,
}));

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  getMediaLibraryEntry: getMediaLibraryEntryMock,
  getMediaAssetBlob: getMediaAssetBlobMock,
}));
vi.mock('../../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: getAggregatePresentationMock,
}));

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

  it('acquires the screen and webcam together when adding a library recording', async () => {
    const { ensureLibraryMediaAssets } = await import('./assets');
    let sequence = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
    );
    getMediaLibraryEntryMock.mockResolvedValue({
      kind: 'recording',
      source: { kind: 'recording', recordingId: 'recording-1' },
    });
    getRecordingMock.mockImplementation(async (id: string) => ({
      id,
      file: createWebmFile(`${id}.webm`),
      filename: `${id}.webm`,
      size: 2048,
      createdAt: 1,
    }));
    const project = createEmptyVideoProject();
    const assets = await ensureLibraryMediaAssets(project, 'library-recording');
    expect(assets).toEqual([
      expect.objectContaining({
        recordingPart: { recordingId: 'recording-1', role: 'primary' },
        source: expect.objectContaining({ originRecordingId: 'recording-1' }),
      }),
      expect.objectContaining({
        recordingPart: { recordingId: 'recording-1', role: 'camera' },
        source: expect.objectContaining({ originRecordingId: 'recording-1-webcam' }),
      }),
    ]);
    expect(saveProjectAssetSafelyMock).toHaveBeenCalledTimes(2);
    expect(project.assets).toHaveLength(0);
  });

  it('rolls back a newly copied screen when saving the camera fails, then permits retry', async () => {
    useDistinctAssetIds();
    const { ensureRecordingAssets } = await import('./assets');
    mockRecordingEntry();
    const entry = await getRecordingMock('recording-1');
    getRecordingMock.mockResolvedValue(entry);
    saveProjectAssetSafelyMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Storage full'));
    const project = createEmptyVideoProject();
    await expect(ensureRecordingAssets(project, 'recording-1')).rejects.toThrow('Storage full');
    expect(deleteProjectAssetMock).toHaveBeenCalledExactlyOnceWith(
      saveProjectAssetSafelyMock.mock.calls[0]![0]
    );
    expect(project.assets).toHaveLength(0);
    expect(await ensureRecordingAssets(project, 'recording-1')).toHaveLength(2);
  });

  it('preserves an existing screen copy when its camera is unavailable', async () => {
    useDistinctAssetIds();
    const { ensureRecordingAssets } = await import('./assets');
    mockRecordingEntry();
    getMediaLibraryEntryMock.mockResolvedValue(undefined);
    const project = createEmptyVideoProject();
    const assets = await ensureRecordingAssets(project, 'recording-1');
    project.assets = assets;
    getMediaLibraryEntryMock.mockResolvedValue({
      source: { kind: 'recording', recordingId: 'recording-1-webcam' },
    });
    await expect(ensureRecordingAssets(project, 'recording-1')).rejects.toThrow();
    expect(deleteProjectAssetMock).not.toHaveBeenCalled();
    expect(saveProjectAssetSafelyMock).toHaveBeenCalledOnce();
    expect(project.assets).toEqual(assets);
  });

  it('reuses both project copies without reading or copying source recordings again', async () => {
    useDistinctAssetIds();
    const { ensureRecordingAssets } = await import('./assets');
    mockRecordingEntry();
    const entry = await getRecordingMock('recording-1');
    getRecordingMock.mockResolvedValue(entry);
    const project = createEmptyVideoProject();
    project.assets = await ensureRecordingAssets(project, 'recording-1');
    getRecordingMock.mockClear();
    saveProjectAssetSafelyMock.mockClear();
    expect(await ensureRecordingAssets(project, 'recording-1')).toEqual(project.assets);
    expect(getRecordingMock).not.toHaveBeenCalled();
    expect(saveProjectAssetSafelyMock).not.toHaveBeenCalled();
  });

  it('copies the current edited image and reuses the project copy on repeat insertion', async () => {
    const { ensureLibraryMediaAssets } = await import('./assets');
    const file = createPngFile();
    getMediaLibraryEntryMock.mockResolvedValue({
      id: 'library-image',
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      filename: 'edited.png',
      workspaceRevision: 3,
    });
    getAggregatePresentationMock.mockResolvedValue({ presentationRevision: 3, previewBlob: file });
    const project = createEmptyVideoProject('Image copy');
    const [asset] = await ensureLibraryMediaAssets(project, 'library-image');
    expect(asset).toMatchObject({
      name: 'edited.png',
      type: VideoProjectAssetType.IMAGE,
      source: { kind: 'project-asset', projectAssetId, originMediaId: 'library-image' },
    });
    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
    expect(saveProjectAssetSafelyMock).toHaveBeenCalledOnce();
    expect(project.assets).toHaveLength(0);
    if (!asset) throw new Error('Missing asset');
    project.assets.push(asset);
    getMediaLibraryEntryMock.mockResolvedValue(undefined);
    expect(await ensureLibraryMediaAssets(project, 'library-image')).toEqual([asset]);
    expect(saveProjectAssetSafelyMock).toHaveBeenCalledOnce();
    expect(getMediaLibraryEntryMock).toHaveBeenCalledOnce();
  });

  it.each([undefined, { presentationRevision: 2 }, { presentationRevision: 3 }])(
    'rejects unavailable or stale image presentation without falling back to original: %j',
    async (presentation) => {
      const { ensureLibraryMediaAssets } = await import('./assets');
      getMediaLibraryEntryMock.mockResolvedValue({
        kind: 'image',
        source: { kind: 'screenshot' },
        workspaceRevision: 3,
      });
      getAggregatePresentationMock.mockResolvedValue(presentation);
      await expect(ensureLibraryMediaAssets(createEmptyVideoProject(), 'image')).rejects.toThrow();
      expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
      expectNoImportSideEffects();
    }
  );

  it('preserves recording identity when adding from the media library', async () => {
    const { ensureLibraryMediaAssets } = await import('./assets');
    mockRecordingEntry();
    getMediaLibraryEntryMock.mockResolvedValue({
      kind: 'recording',
      source: { kind: 'recording', recordingId: 'recording-1' },
    });
    const project = createEmptyVideoProject();
    const [asset] = await ensureLibraryMediaAssets(project, 'library-recording');
    expect(asset).toMatchObject({
      type: VideoProjectAssetType.RECORDING,
      source: { originRecordingId: 'recording-1' },
    });
    if (!asset) throw new Error('Missing asset');
    project.assets.push(asset);
    expect(await ensureLibraryMediaAssets(project, 'library-recording')).toEqual([asset]);
    expect(saveProjectAssetSafelyMock).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    { kind: 'audio', source: { kind: 'project-asset' } },
    { kind: 'web-archive', source: { kind: 'web-snapshot' } },
  ])('rejects missing and unsupported library entries before copying: %j', async (entry) => {
    const { ensureLibraryMediaAssets } = await import('./assets');
    getMediaLibraryEntryMock.mockResolvedValue(entry);
    await expect(ensureLibraryMediaAssets(createEmptyVideoProject(), 'missing')).rejects.toThrow();
    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
    expectNoImportSideEffects();
  });

  it('validates exported video bytes and propagates storage failure without changing the project', async () => {
    const { ensureLibraryMediaAssets } = await import('./assets');
    const project = createEmptyVideoProject();
    getMediaLibraryEntryMock.mockResolvedValue({
      kind: 'export',
      source: { kind: 'project-export' },
      filename: 'export.webm',
    });
    getMediaAssetBlobMock.mockResolvedValue(new Blob(['invalid'], { type: 'video/webm' }));
    await expect(ensureLibraryMediaAssets(project, 'export')).rejects.toThrow();
    expectNoImportSideEffects();
    getMediaAssetBlobMock.mockResolvedValue(createWebmFile());
    saveProjectAssetSafelyMock.mockRejectedValueOnce(new Error('Storage full'));
    await expect(ensureLibraryMediaAssets(project, 'export')).rejects.toThrow('Storage full');
    expect(project.assets).toHaveLength(0);
  });

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

function useDistinctAssetIds() {
  let sequence = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
  );
}

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

  getRecordingMock.mockImplementation(async (id: string) =>
    id === 'recording-1'
      ? {
          file: recordingBlob,
          createdAt: 1,
          filename: 'recording.webm',
          id: 'recording-1',
          size: 2048,
        }
      : undefined
  );
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
  const { ensureRecordingAssets } = await import('./assets');
  const recordingBlob = mockRecordingEntry();
  const project = createEmptyVideoProject('Recording copy');

  const [asset] = await ensureRecordingAssets(project, 'recording-1');

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
