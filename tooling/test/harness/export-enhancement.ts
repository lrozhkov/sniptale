import { inspectEnhancementContainer } from './export-enhancement-container';
import {
  ALL_FORMATS,
  AudioBufferSource,
  AudioSampleSink,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
} from 'mediabunny';
import {
  getProjectAsset,
  saveProjectAsset,
} from '../../../apps/extension/src/composition/persistence/projects/index';
import {
  createVideoProjectAsset,
  createVideoProjectFromRecording,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../apps/extension/src/features/video/project/mutation';
import { isVideoProjectClip } from '../../../apps/extension/src/features/video/project/validation/clips';
import { isVideoProjectAsset } from '../../../apps/extension/src/features/video/project/validation/assets';
import {
  isCursorTrack,
  isMotionRegion,
  isActionEvent,
} from '../../../apps/extension/src/features/video/project/validation/interaction';
import { hasValidVideoProjectCursorSourceObservations } from '../../../apps/extension/src/features/video/project/cursor-source-observations';
import {
  assertExportReadyVideoProject,
  isHydratableVideoProject,
  isExportReadyVideoProject,
} from '../../../apps/extension/src/features/video/project/validation';
import { bindMotionRegionToClip } from '../../../apps/extension/src/features/video/project/motion/source-binding';
import { createVideoProjectMotionRegion } from '../../../apps/extension/src/features/video/project/motion';
import { createQuickEditSpotlight } from '../../../apps/extension/src/features/video/project/scene/focus-appearance';
import {
  REVIEW_CLICK_DEFAULT,
  parseVideoProjectActionFeedback,
} from '../../../apps/extension/src/features/video/project/action-feedback/validation';
import { createQuickEditAdvancedState } from '../../../apps/extension/src/features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../../apps/extension/src/features/video/review/advanced/zoom';
import { createNeutralPresentationSettings } from '../../../apps/extension/src/features/video/review/advanced/presentation';
import { probeEnhancementCapabilities } from '../../../apps/extension/src/features/video/composition/export-enhancement/enhancer';
import { inspectReviewMedia } from '../../../apps/extension/src/workflows/video-review/media-index';
import { writeReviewFrames } from '../../../apps/extension/src/workflows/video-review/render-export';
import { createReviewRecordingRenderSource } from '../../../apps/extension/src/workflows/video-review/recording-render';
import { createCursorTrajectoryBlockPacker } from '../../../apps/extension/src/features/video/project/cursor-trajectory/blocks';
import { normalizeVideoProjectCursorSkin } from '../../../apps/extension/src/features/video/project/cursor';
import { createRecordingCursorTrajectoryStore } from '../../../apps/extension/src/composition/persistence/recordings/cursor-trajectory/store';
import { initDB } from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import type { CursorTrajectoryDescriptor } from '../../../apps/extension/src/features/video/project/cursor-trajectory/types';
import type {
  VideoProject,
  VideoProjectAsset,
  VideoExportDetailMode,
} from '../../../apps/extension/src/features/video/project/types';
import type { ReviewEdit } from '../../../apps/extension/src/features/video/review/types';
import type { QuickEditAdvancedState } from '../../../apps/extension/src/features/video/review/advanced/types';
import type { RecordingTelemetryEntry } from '../../../apps/extension/src/composition/persistence/recordings/contracts';

const WIDTH = 1920,
  HEIGHT = 1080,
  FPS = 30,
  SOURCE_DURATION = 12;
const PROBES = [0.25, 1, 2, 3, 4, 5, 6, 7, 8, 8.5, 9.25];
const POSES = [
  { start: 0, end: 0.75, scale: 1.5 },
  { start: 0.75, end: 1.75, scale: 2 },
  { start: 1.75, end: 2.75, scale: 3 },
  { start: 2.75, end: 4.75, scale: 1 },
  { start: 4.75, end: 6.75, scale: 1.5 },
  { start: 6.75, end: 8.25, scale: 2 },
  { start: 8.25, end: 10, scale: 2 },
];
const EDITS: ReviewEdit[] = [
  {
    id: 'speed',
    kind: 'speed',
    start: 8,
    end: 10,
    requestedStart: 8,
    requestedEnd: 10,
    rate: 2,
    audio: 'speed',
  },
  {
    id: 'cut',
    kind: 'cut',
    start: 10,
    end: 11,
    requestedStart: 10,
    requestedEnd: 11,
    transition: { type: 'dissolve', before: 0.1, after: 0.1 },
  },
];
export type EnhancementFixtureVariant = 'overlapping-scene-lenses';
export interface EnhancementFixture {
  variant?: EnhancementFixtureVariant;
  project: Omit<VideoProject, 'effectSnapshots'>;
  historyProject: Omit<VideoProject, 'effectSnapshots'>;
  sourceAssetId: string;
  sourceFormat: 'mp4' | 'webm';
  telemetry: RecordingTelemetryEntry;
}
/** Selected fixture seconds are in the initial source interval, before the authored speed/cut edits. */
export interface EnhancementProofWindow {
  start: number;
  end: number;
}
export interface InspectionOptions {
  duration?: number;
  offset?: number;
  fadeIn?: boolean;
  probes?: readonly number[];
  seeks?: readonly number[];
  effectRoi?: boolean;
}
let retainedOutput: Blob | null = null;

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Export proof Canvas is unavailable.');
  return { canvas, context };
}
function sourceTime(resultTime: number) {
  return resultTime < 8 ? resultTime : resultTime < 9 ? 8 + (resultTime - 8) * 2 : resultTime + 2;
}
function palette(frame: number, source: number) {
  const code = Math.min(359, Math.max(0, frame)) + source * 360;
  return [
    24 + 24 * (code % 9),
    24 + 24 * (Math.floor(code / 9) % 9),
    24 + 24 * Math.floor(code / 81),
  ];
}
function paintSource(context: CanvasRenderingContext2D, frame: number, source: number) {
  context.fillStyle = `rgb(${palette(frame, source).join(',')})`;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#ffffff';
  for (const [x, y] of [
    [1088, 612],
    [832, 468],
  ])
    context.fillRect(x! - 8, y! - 8, 16, 16);
  context.fillStyle = '#101010';
  context.fillRect(912, 504, 96, 72);
  context.fillStyle = '#f0f0f0';
  for (let x = 913; x < 1008; x += 3) context.fillRect(x, 505, 1, 70);
  context.font = '13px monospace';
  context.fillText('Source UI 123', 900, 592);
}
async function sourceFile(kind: 'A' | 'B' | 'combined', format: 'mp4' | 'webm') {
  const { canvas, context } = surface(WIDTH, HEIGHT);
  const output = new Output({
    format:
      format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, {
    codec: format === 'mp4' ? 'avc' : 'vp9',
    bitrate: 12_000_000,
    keyFrameInterval: 1,
  });
  const audio = new AudioBufferSource({
    codec: format === 'mp4' ? 'aac' : 'opus',
    bitrate: 128_000,
  });
  output.addVideoTrack(video);
  output.addAudioTrack(audio);
  await output.start();
  try {
    for (let frame = 0; frame < SOURCE_DURATION * FPS; frame++) {
      paintSource(
        context,
        frame,
        kind === 'B' || (kind === 'combined' && frame >= 11 * FPS) ? 1 : 0
      );
      await video.add(frame / FPS, 1 / FPS);
    }
    video.close();
    const buffer = new AudioBuffer({
      length: SOURCE_DURATION * 48000,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    const pcm = buffer.getChannelData(0);
    for (let second = 1; second < SOURCE_DURATION; second++)
      for (let i = second * 48000; i < second * 48000 + 2400; i++)
        pcm[i] = Math.sin((i * 2 * Math.PI * 880) / 48000) * 0.3;
    await audio.add(buffer);
    audio.close();
    await output.finalize();
    if (!output.target.buffer) throw new Error('Source fixture has no encoded bytes.');
    return new Blob([output.target.buffer], { type: `video/${format}` });
  } catch (error) {
    await output.cancel();
    throw error;
  }
}
async function assetFile(id: string) {
  const result = await getProjectAsset(id);
  if (result.status !== 'ready') throw new Error(`Source fixture is unavailable: ${result.status}`);
  return result.entry.file;
}
function magnifyingLens(optics: 'flat' | 'optical') {
  return {
    ...createQuickEditSpotlight(),
    effect: 'magnify' as const,
    magnification: 2,
    lensOptics: optics,
    strength: 0,
    area: { x: 0.35, y: 0.3, width: 0.3, height: 0.4 },
    lensShape: 'circle' as const,
    lensEdgeWidth: 8,
  };
}
function nativeRegions(project: VideoProject, variant?: EnhancementFixtureVariant) {
  const regions = POSES.map((pose) => ({
    ...createVideoProjectMotionRegion(project, pose.start, { enter: 'none', exit: 'none' }),
    duration: pose.end - pose.start,
    scale: pose.scale,
    zoomInDuration: 0,
    zoomOutDuration: 0,
    ...(pose.start === 4.75
      ? { perspective: { enabled: true, rotateX: 0, rotateY: 18, rotateZ: 0, strength: 0.4 } }
      : {}),
    ...(pose.start === 8.25
      ? {
          phaseTransitions: { enter: 'linear' as const, exit: 'none' as const },
          zoomInDuration: 0.75,
          motionBlur: { enter: { enabled: true, strength: 0.7 } },
        }
      : {}),
  }));
  for (const [start, end, optics] of [
    [2.75, 3.75, 'flat'],
    [3.75, 4.75, 'optical'],
    [6.75, 8.25, 'optical'],
  ] as const)
    for (const clip of project.clips) {
      if (clip.type !== 'VIDEO') continue;
      const regionStart = Math.max(start, clip.startTime),
        regionEnd = Math.min(end, clip.startTime + clip.duration);
      if (regionEnd <= regionStart) continue;
      regions.push(
        bindMotionRegionToClip(
          {
            ...createVideoProjectMotionRegion(project, regionStart, {
              enter: 'none',
              exit: 'none',
            }),
            duration: regionEnd - regionStart,
            scale: 1,
            zoomInDuration: 0,
            zoomOutDuration: 0,
            spotlight: magnifyingLens(optics),
            spotlightTarget: 'scene',
          },
          clip
        )
      );
    }
  if (variant === 'overlapping-scene-lenses') {
    for (const clip of project.clips) {
      if (clip.type !== 'VIDEO' || clip.startTime > 7 || clip.startTime + clip.duration < 8)
        continue;
      regions.push(
        bindMotionRegionToClip(
          {
            ...createVideoProjectMotionRegion(project, 7, { enter: 'none', exit: 'none' }),
            duration: 1,
            scale: 1,
            zoomInDuration: 0,
            zoomOutDuration: 0,
            spotlight: {
              ...magnifyingLens('optical'),
              area: { x: 0.375, y: 0.325, width: 0.25, height: 0.35 },
            },
            spotlightTarget: 'scene',
          },
          clip
        )
      );
    }
  }
  return regions;
}
function sourceActions() {
  return [6, 7.5].map((time, index) => ({
    id: `click-${index}`,
    kind: 'CLICK' as const,
    time,
    duration: 0,
    point: { x: 0.5, y: 0.5 },
    label: '',
    preset: 'NONE' as const,
    data: {
      gestureType: 'click',
      gestureId: `click-${index}`,
      button: 0,
      downTime: time,
      upTime: time + 0.05,
      pressDuration: 0.05,
      downX: 0.5,
      downY: 0.5,
      upX: 0.5,
      upY: 0.5,
      maxExcursionCssPx: 0,
      completion: 'released',
    },
  }));
}
async function makeAsset(name: string, blob: Blob, recordingId: string) {
  const id = crypto.randomUUID();
  await saveProjectAsset(id, blob, blob.type, name);
  return createVideoProjectAsset(
    name,
    'RECORDING',
    { kind: 'project-asset', projectAssetId: id, originRecordingId: recordingId },
    {
      width: WIDTH,
      height: HEIGHT,
      duration: SOURCE_DURATION,
      mimeType: blob.type,
      size: blob.size,
      hasAudio: true,
      audioPeaks: null,
    }
  );
}
function recordedProject(asset: ReturnType<typeof createVideoProjectAsset>, recordingId: string) {
  return createVideoProjectFromRecording({
    recordingId,
    filename: asset.name,
    width: WIDTH,
    height: HEIGHT,
    duration: SOURCE_DURATION,
    mimeType: asset.metadata.mimeType!,
    size: asset.metadata.size!,
    hasAudio: true,
    asset,
    sourceNormalizedActionEvents: sourceActions(),
  });
}
function packedCursor(recordingId: string) {
  const trajectoryId = crypto.randomUUID().replaceAll('-', '');
  const packer = createCursorTrajectoryBlockPacker(recordingId, trajectoryId);
  const blocks = packer.append({
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    width: WIDTH,
    height: HEIGHT,
    reason: 'start',
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  });
  for (let i = 0; i <= 360; i++)
    blocks.push(
      ...packer.append({
        kind: 'sample',
        segmentId: 0,
        observationSeq: i,
        activeTimeUs: Math.round((i * 1_000_000) / 30),
        xQ8: (960 + Math.round(Math.sin(i / 30) * 80)) * 256,
        yQ8: 540 * 256,
        observed: true,
        visible: true,
        event: 'move',
        button: 'none',
        relatedObservationSeq: null,
        anchors: [],
      })
    );
  blocks.push(
    ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 12_010_000, reason: 'stop' }),
    ...packer.finish()
  );
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId,
    state: 'complete',
    finalized: true,
    ...packer.summary(),
  };
  return { blocks, descriptor };
}
async function archivedCursor(recordingId: string): Promise<CursorTrajectoryDescriptor> {
  const { blocks, descriptor } = packedCursor(recordingId);
  const store = createRecordingCursorTrajectoryStore({
    database: initDB,
    mintGeneration: () => crypto.randomUUID(),
  });
  const writer = await store.begin(
    { recordingId, trajectoryId: descriptor.trajectoryId },
    { width: WIDTH, height: HEIGHT }
  );
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, descriptor, 'complete');
  return descriptor;
}
function fixtureRefusals(project: VideoProject) {
  const invalidAsset = structuredClone(project),
    invalidBinding = structuredClone(project),
    invalidIdentity = structuredClone(project),
    invalidGesture = structuredClone(project);
  invalidAsset.assets[0]!.type = 'VIDEO';
  const lens = invalidBinding.motionRegions?.find((region) => region.spotlightTarget === 'scene');
  if (!lens) throw new Error('Schema proof has no scene lens.');
  delete lens.sourceBinding;
  const videos = invalidIdentity.clips.filter((clip) => clip.type === 'VIDEO');
  const first = videos[0],
    last = videos.at(-1);
  if (!first || !last || first.type !== 'VIDEO' || last.type !== 'VIDEO' || !first.sourceInstanceId)
    throw new Error('Schema proof has no source endpoints.');
  last.sourceInstanceId = first.sourceInstanceId;
  delete invalidGesture.actionEvents[0]!.data['downX'];
  const cases = [
    ['recording-asset-type', invalidAsset],
    ['scene-source-binding', invalidBinding],
    ['source-instance-owner', invalidIdentity],
    ['released-gesture-facts', invalidGesture],
  ] as const;
  for (const [name, candidate] of cases)
    if (isExportReadyVideoProject(candidate))
      throw new Error(`Schema proof accepted invalid ${name}.`);
  return cases.map(([name]) => name);
}
export function checkEnhancementFixtureSchema(variant?: EnhancementFixtureVariant) {
  const recordingId = 'export-enhancement-schema';
  const { descriptor } = packedCursor(recordingId);
  const assets = ['A', 'B', 'combined'].map((name) =>
    createVideoProjectAsset(
      name,
      'RECORDING',
      {
        kind: 'project-asset',
        projectAssetId: crypto.randomUUID(),
        originRecordingId: recordingId,
      },
      {
        width: WIDTH,
        height: HEIGHT,
        duration: SOURCE_DURATION,
        size: 1024,
        mimeType: 'video/mp4',
        hasAudio: true,
        audioPeaks: null,
      }
    )
  );
  const { project, historyProject } = buildEnhancementFixtureProjects(
    assets,
    recordingId,
    descriptor,
    'mp4',
    variant
  );
  const sceneRegions =
    project.motionRegions?.filter((region) => region.spotlightTarget === 'scene') ?? [];
  if (
    !sceneRegions.length ||
    sceneRegions.some(
      (region) =>
        !project.clips.some(
          (clip) => clip.type === 'VIDEO' && clip.id === region.sourceBinding?.clipId
        )
    )
  )
    throw new Error('Scene lens fixture has no admitted source binding.');
  return {
    nativeVersion: project.version,
    historyVersion: historyProject.version,
    nativeClips: project.clips.length,
    sceneRegions: sceneRegions.length,
    archivedSamples: descriptor.totalSamples,
    rejected: fixtureRefusals(project),
  };
}
export async function createEnhancementFixture(
  variant?: EnhancementFixtureVariant
): Promise<EnhancementFixture> {
  const avc = await VideoEncoder.isConfigSupported({
    codec: 'avc1.420028',
    width: WIDTH,
    height: HEIGHT,
    framerate: FPS,
    bitrate: 12_000_000,
  });
  const aac = await AudioEncoder.isConfigSupported({
    codec: 'mp4a.40.2',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 128_000,
  });
  const format = avc.supported && aac.supported ? 'mp4' : 'webm';
  const recordingId = crypto.randomUUID();
  const assets = [];
  for (const kind of ['A', 'B', 'combined'] as const)
    assets.push(await makeAsset(`${kind}.${format}`, await sourceFile(kind, format), recordingId));
  const trajectory = await archivedCursor(recordingId);
  return buildEnhancementFixtureProjects(assets, recordingId, trajectory, format, variant);
}
export function buildEnhancementFixtureProjects(
  assets: readonly VideoProjectAsset[],
  recordingId: string,
  trajectory: CursorTrajectoryDescriptor,
  format: 'mp4' | 'webm',
  variant?: EnhancementFixtureVariant
): EnhancementFixture {
  const [a, b, combined] = assets;
  if (!a || !b || !combined || combined.source.kind !== 'project-asset')
    throw new Error('Source assets are incomplete.');
  const project = recordedProject(a, recordingId);
  const original = structuredClone(project.clips);
  project.clips = [];
  for (const clip of original) {
    if (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') continue;
    for (const part of [
      { start: 0, duration: 8, sourceStart: 0, sourceDuration: 8, playbackRate: 1 },
      { start: 8, duration: 1, sourceStart: 8, sourceDuration: 2, playbackRate: 2 },
      { start: 9, duration: 1, sourceStart: 11, sourceDuration: 1, playbackRate: 1 },
    ]) {
      project.clips.push({
        ...structuredClone(clip),
        id: part.start === 0 ? clip.id : crypto.randomUUID(),
        assetId: part.start === 9 ? b.id : a.id,
        ...(clip.type === 'VIDEO' && part.start === 9
          ? { sourceInstanceId: crypto.randomUUID() }
          : {}),
        startTime: part.start,
        duration: part.duration,
        sourceStart: part.sourceStart,
        sourceDuration: part.sourceDuration,
        playbackRate: part.playbackRate,
        fadeInMs: 0,
        fadeOutMs: 0,
      });
    }
  }
  for (const clip of project.clips)
    if (clip.type === 'VIDEO' && clip.startTime === 9)
      clip.sourceCrop = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
  project.assets.push(b);
  project.duration = 10;
  const right = project.clips.find((clip) => clip.type === 'VIDEO' && clip.startTime === 9);
  if (!right) throw new Error('Source endpoint fixture is unavailable.');
  project.compositionJoins = [
    {
      id: 'source-change',
      clipId: right.id,
      edge: 'start',
      sampling: 'cut',
      transition: { type: 'dissolve', before: 0.1, after: 0.1 },
    },
  ];
  project.motionRegions = nativeRegions(project, variant);
  for (const group of project.actionFeedback ?? [])
    group.gestureStyles = sourceActions().map((event) => ({
      ...REVIEW_CLICK_DEFAULT,
      id: event.id,
      effect: 'magnify',
      radius: 100,
      after: 0.6,
      magnification: 2,
      lensOptics: 'optical',
      lensEdgeWidth: 8,
    }));
  const historyProject = recordedProject(combined, recordingId);
  for (const target of [project, historyProject]) {
    const video = target.clips.find((clip) => clip.type === 'VIDEO');
    if (!video?.sourceInstanceId) throw new Error('Archive source identity is unavailable.');
    target.cursorTrack = {
      captureMode: 'embedded-fallback',
      skin: { ...normalizeVideoProjectCursorSkin(undefined), hidden: true },
      samples: [],
      sourceObservations: [
        { recordingId, sourceInstanceId: video.sourceInstanceId, samples: [], trajectory },
      ],
    };
  }
  const telemetry: RecordingTelemetryEntry = {
    recordingId,
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    signals: [],
    cursorTrajectory: trajectory,
    actionEvents: sourceActions().map((event) => ({
      ...event,
      point: { x: 960, y: 540 },
      recordingPoint: event.point,
    })),
  };
  const nativeProject = applyVideoProjectMutationPatch(project, {});
  const canonicalHistory = applyVideoProjectMutationPatch(historyProject, {});
  assertFixtureProject(nativeProject, 'Native');
  assertFixtureProject(canonicalHistory, 'History');
  return {
    project: nativeProject,
    historyProject: canonicalHistory,
    sourceAssetId: combined.source.projectAssetId,
    sourceFormat: format,
    telemetry,
    ...(variant ? { variant } : {}),
  };
}
function assertFixtureProject(project: VideoProject, name: string) {
  try {
    assertExportReadyVideoProject(project);
  } catch (cause) {
    throw new Error(
      `${name} fixture admission failed: ${JSON.stringify({
        shape: isHydratableVideoProject(project),
        version: project.version,
        version51Shape: isHydratableVideoProject({ ...project, version: 51 }),
        withoutActions: isHydratableVideoProject({ ...project, actionEvents: [] }),
        withoutJoins: isHydratableVideoProject({ ...project, compositionJoins: [] }),
        invalidActions: project.actionEvents
          .filter((event) => !isActionEvent(event))
          .map((event) => event.id),
        invalidAssets: project.assets
          .filter((asset) => !isVideoProjectAsset(asset))
          .map((asset) => asset.id),
        invalidClips: project.clips.flatMap((clip, index) =>
          !isVideoProjectClip(clip) ? [index] : []
        ),
        invalidMotion: project.motionRegions
          ?.filter((region) => !isMotionRegion(region))
          .map((region) => region.id),
        cursorShape: isCursorTrack(project.cursorTrack),
        cursorReferences: hasValidVideoProjectCursorSourceObservations(project),
        feedbackShape: parseVideoProjectActionFeedback(project.actionFeedback) !== null,
      })}`,
      { cause }
    );
  }
}
function galleryState(
  presentation: boolean,
  variant?: EnhancementFixtureVariant
): QuickEditAdvancedState {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.ui.tracks.actions = true;
  advanced.zoom.enabled = true;
  advanced.zoom.regions = POSES.map((pose) => ({
    ...createQuickEditZoomRegion({
      id: `camera-${pose.start}`,
      at: pose.start,
      duration: pose.end - pose.start,
    }),
    followCursor: false,
    transform: { scale: pose.scale, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none', duration: 0 },
    exit: { type: 'none', duration: 0 },
    ...(pose.start === 4.75
      ? { perspective: { enabled: true, rotateX: 0, rotateY: 18, rotateZ: 0, strength: 0.4 } }
      : {}),
    ...(pose.start === 8.25
      ? {
          enter: { type: 'linear' as const, duration: 0.75 },
          motionBlur: { enter: { enabled: true, strength: 0.7 } },
        }
      : {}),
  }));
  for (const [start, end, optics] of [
    [2.75, 3.75, 'flat'],
    [3.75, 4.75, 'optical'],
    [6.75, 8.25, 'optical'],
  ] as const)
    advanced.zoom.regions.push({
      ...createQuickEditZoomRegion({ id: `lens-${start}`, at: start, duration: end - start }),
      transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      spotlight: magnifyingLens(optics),
    });
  if (variant === 'overlapping-scene-lenses')
    advanced.zoom.regions.push({
      ...createQuickEditZoomRegion({ id: 'lens-overlap', at: 7, duration: 1 }),
      transform: { scale: 1, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      spotlight: {
        ...magnifyingLens('optical'),
        area: { x: 0.375, y: 0.325, width: 0.25, height: 0.35 },
      },
    });
  advanced.clickAnimations = sourceActions().map((event) => ({
    ...REVIEW_CLICK_DEFAULT,
    id: event.id,
    effect: 'magnify',
    radius: 100,
    after: 0.6,
    magnification: 2,
    lensOptics: 'optical',
    lensEdgeWidth: 8,
  }));
  if (presentation) {
    advanced.presentation = createNeutralPresentationSettings();
    advanced.presentation.fadeIn = {
      ...advanced.presentation.fadeIn,
      enabled: true,
      duration: 0.1,
    };
  }
  return advanced;
}
function galleryEdits(
  sourceDuration: number,
  reference: boolean,
  window?: EnhancementProofWindow
): ReviewEdit[] {
  const selection = window ?? (reference ? { start: 1, end: 1.5 } : null);
  if (
    selection &&
    (!Number.isFinite(selection.start) ||
      !Number.isFinite(selection.end) ||
      selection.start < 0 ||
      selection.end <= selection.start ||
      selection.end > Math.min(8, sourceDuration))
  )
    throw new RangeError('Selected proof interval is outside the unedited source window.');
  if (selection)
    return [
      ...(selection.start > 0
        ? [
            {
              id: 'head',
              kind: 'cut' as const,
              requestedStart: 0,
              requestedEnd: selection.start,
              start: 0,
              end: selection.start,
            },
          ]
        : []),
      {
        id: 'tail',
        kind: 'cut',
        requestedStart: selection.end,
        requestedEnd: sourceDuration,
        start: selection.end,
        end: sourceDuration,
      },
    ];
  return [
    ...EDITS,
    ...(sourceDuration > SOURCE_DURATION
      ? [
          {
            id: 'encoder-padding',
            kind: 'cut' as const,
            requestedStart: SOURCE_DURATION,
            requestedEnd: sourceDuration,
            start: SOURCE_DURATION,
            end: sourceDuration,
          },
        ]
      : []),
  ];
}
export async function renderEnhancementGallery(
  fixture: EnhancementFixture,
  mode: VideoExportDetailMode,
  presentation: boolean,
  reference = false,
  window?: EnhancementProofWindow,
  inspection: Pick<InspectionOptions, 'effectRoi'> = {}
) {
  const file = await assetFile(fixture.sourceAssetId),
    signal = new AbortController().signal;
  const advanced = galleryState(presentation, fixture.variant);
  const index = await inspectReviewMedia(file, signal);
  const edits = galleryEdits(index.duration, reference, window);
  const history = createReviewRecordingRenderSource({
    project: fixture.historyProject,
    telemetry: fixture.telemetry,
    source: {
      width: WIDTH,
      height: HEIGHT,
      duration: index.duration,
      size: file.size,
      mimeType: file.type,
    },
    advanced,
    edits: window ? galleryEdits(index.duration, false) : edits,
  });
  const chunks: { offset: number; bytes: Uint8Array }[] = [];
  let reads = 0,
    divergentReads = 0;
  const clocks: {
    first: { sourceTime: number; globalResultTime: number } | null;
    last: { sourceTime: number; globalResultTime: number } | null;
  } = { first: null, last: null };
  try {
    await writeReviewFrames({
      file,
      index,
      advanced,
      signal,
      edits,
      fragmentOffset: window?.start ?? (reference ? 1 : 0),
      recordingHistory: {
        ...history,
        read: async (...args) => {
          reads++;
          const clock = { sourceTime: args[0], globalResultTime: args[1] };
          clocks.first ??= clock;
          clocks.last = clock;
          if (Math.abs(args[0] - args[1]) > 0.1) divergentReads++;
          return history.read(...args);
        },
      },
      renderSettings: {
        format: 'mp4',
        codec: 'vp9',
        frameRate: FPS,
        quality: 'HIGH',
        detailEnhancement: mode,
      },
      readProjectAsset: async (id) => assetFile(id),
      writer: {
        writeAt: async (offset, blob) => {
          chunks.push({ offset, bytes: new Uint8Array(await blob.arrayBuffer()) });
        },
      },
    });
  } finally {
    history.dispose();
  }
  const bytes = new Uint8Array(
    Math.max(0, ...chunks.map((chunk) => chunk.offset + chunk.bytes.length))
  );
  for (const chunk of chunks) bytes.set(chunk.bytes, chunk.offset);
  const blob = new Blob([bytes], { type: 'video/mp4' });
  retainedOutput = blob;
  try {
    return {
      ...(await inspectEnhancementOutput(blob, {
        duration: window ? window.end - window.start : reference ? 0.5 : 10,
        offset: window?.start ?? (reference ? 1 : 0),
        fadeIn: presentation,
        ...inspection,
        ...(window ? { probes: [0.1, 0.3, 0.6, 0.9], seeks: [0.9, 0.1, 0.6] } : {}),
      })),
      sourceIndex: { duration: index.duration },
      history: { reads, divergentReads, firstClock: clocks.first, lastClock: clocks.last },
      proofWindow: window ?? null,
    };
  } catch (error) {
    if (error instanceof Error && error.constructor === Error)
      error.message += ` sourceIndexDuration=${index.duration}, reference=${reference}, presentation=${presentation}.`;
    throw error;
  }
}

function backgroundError(context: CanvasRenderingContext2D, time: number) {
  const pixels = context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
  const source = sourceTime(time),
    frame = Math.floor(source * FPS + 1e-5),
    sourceId = source >= 11 ? 1 : 0;
  const colors = [-1, 0, 1].map((delta) => palette(frame + delta, sourceId)),
    errors: number[] = [];
  for (let y = 10; y < context.canvas.height - 10; y += 10)
    for (let x = 10; x < context.canvas.width - 10; x += 10) {
      const i = (y * context.canvas.width + x) * 4;
      errors.push(
        Math.min(
          ...colors.map(
            (expected) =>
              (Math.abs(pixels[i]! - expected[0]!) +
                Math.abs(pixels[i + 1]! - expected[1]!) +
                Math.abs(pixels[i + 2]! - expected[2]!)) /
              3
          )
        )
      );
    }
  errors.sort((a, b) => a - b);
  return errors[Math.floor(errors.length / 2)]!;
}
function landmark(context: CanvasRenderingContext2D, scale: number) {
  const expected = { x: WIDTH / 2 + 128 * scale, y: HEIGHT / 2 + 72 * scale };
  const left = Math.floor(expected.x - 40),
    top = Math.floor(expected.y - 40);
  const pixels = context.getImageData(left, top, 80, 80).data;
  let count = 0,
    sumX = 0,
    sumY = 0;
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 80; x++) {
      const i = (y * 80 + x) * 4;
      if (Math.min(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) > 235) {
        count++;
        sumX += left + x + 0.5;
        sumY += top + y + 0.5;
      }
    }
  return { count, expected, x: count ? sumX / count : null, y: count ? sumY / count : null };
}
function effectRoi(context: CanvasRenderingContext2D) {
  const bounds = { x: 480, y: 180, width: 960, height: 720 };
  // Read real neighboring pixels so the negative controls translate the decoded image, not its metric.
  const margin = 3,
    width = bounds.width,
    height = bounds.height,
    stride = width + margin * 2;
  const pixels = context.getImageData(
    bounds.x - margin,
    bounds.y - margin,
    stride,
    height + margin * 2
  ).data;
  const profiles = (dx: number, dy: number) => {
    const integral = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        const index = ((y + margin - dy) * stride + x + margin - dx) * 4;
        row += 0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!;
        integral[(y + 1) * (width + 1) + x + 1] = row + integral[y * (width + 1) + x + 1]!;
      }
    }
    // A 31-pixel box removes the fine stripe phase; the observed panel boundary supplies placement.
    const blurred = new Float64Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const left = Math.max(0, x - 15),
          right = Math.min(width, x + 16);
        const top = Math.max(0, y - 15),
          bottom = Math.min(height, y + 16);
        blurred[y * width + x] =
          (integral[bottom * (width + 1) + right]! -
            integral[top * (width + 1) + right]! -
            integral[bottom * (width + 1) + left]! +
            integral[top * (width + 1) + left]!) /
          ((right - left) * (bottom - top));
      }
    const horizontal = new Array<number>(width).fill(0),
      vertical = new Array<number>(height).fill(0);
    for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        horizontal[x] =
          horizontal[x]! + Math.abs(blurred[y * width + x + 1]! - blurred[y * width + x - 1]!);
        vertical[y] =
          vertical[y]! + Math.abs(blurred[(y + 1) * width + x]! - blurred[(y - 1) * width + x]!);
      }
    return { x: horizontal, y: vertical };
  };
  return { bounds, boundary: profiles(0, 0), shiftedX: profiles(3, 0), shiftedY: profiles(0, 3) };
}
async function inspectAudio(input: Input, duration: number) {
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('Export output has no audio track.');
  const sums = new Float64Array(Math.ceil((duration + 0.1) * 1000)),
    counts = new Uint32Array(sums.length);
  let frames = 0,
    end = 0,
    start = Infinity;
  for await (const sample of new AudioSampleSink(track).samples()) {
    try {
      const audio = sample.toAudioBuffer();
      start = Math.min(start, sample.timestamp);
      end = Math.max(end, sample.timestamp + sample.duration);
      const pcm = audio.getChannelData(0);
      frames += pcm.length;
      for (let i = 0; i < pcm.length; i++) {
        const bin = Math.floor((sample.timestamp + i / audio.sampleRate) * 1000);
        if (bin >= 0 && bin < sums.length) {
          sums[bin]! += pcm[i]! * pcm[i]!;
          counts[bin]!++;
        }
      }
    } finally {
      sample.close();
    }
  }
  const pulses: number[] = [];
  let active = false;
  for (let i = 0; i < sums.length; i++) {
    const high = counts[i]! > 0 && Math.sqrt(sums[i]! / counts[i]!) > 0.06;
    if (high && !active) pulses.push(i / 1000);
    active = high;
  }
  return { frames, start, end, pulses };
}
function isPresentedSample(sample: { timestamp: number; duration: number }, end: number) {
  const timing = `timestamp=${sample.timestamp}, duration=${sample.duration}, outputDuration=${end}`;
  if (
    !Number.isFinite(sample.timestamp) ||
    !Number.isFinite(sample.duration) ||
    sample.timestamp < 0 ||
    sample.duration < 0
  )
    throw new Error(`Decoded video sample timing is invalid (${timing}).`);
  if (sample.duration === 0) {
    // The muxed terminal marker can sit at the half-open interval end without a presentation span.
    if (Math.abs(sample.timestamp - end) > 1e-9)
      throw new Error(`Zero-duration video sample is not terminal (${timing}).`);
    return false;
  }
  // One microsecond covers WebCodecs integer timestamp rounding, not an additional output frame.
  if (sample.timestamp >= end || sample.timestamp + sample.duration > end + 1e-6)
    throw new Error(`Presented video sample exceeds the output interval (${timing}).`);
  return true;
}
function matchesProbeTimestamp(timestamp: number, probe: number) {
  // Native WebM uses 1ms TimecodeScale and rounds to the nearest tick. Adjacent 30FPS frames remain separate.
  return Math.abs(timestamp - Math.floor(probe * FPS) / FPS) <= 0.0005 + 1e-9;
}
export async function inspectEnhancementOutput(file: Blob, options: InspectionOptions = {}) {
  const duration = options.duration ?? 10,
    offset = options.offset ?? 0;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const { canvas, context } = surface(WIDTH, HEIGHT),
    small = surface(320, 180);
  let decodedFrames = 0,
    presentedFrames = 0,
    terminalSamples = 0,
    lastTimestamp = -Infinity,
    firstTimestamp = Infinity,
    videoEnd = 0;
  const selected: {
    timestamp: number;
    colorError: number;
    landmark: ReturnType<typeof landmark> | null;
    detail: number[];
    effectRoi?: ReturnType<typeof effectRoi>;
  }[] = [];
  const decodedSamples: { timestamp: number; duration: number }[] = [];
  const failures: { timestamp: number; error: number }[] = [],
    packets: { timestamp: number; duration: number; type: string; sequence: number }[] = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Export output has no video track.');
    const dimensions = { width: track.displayWidth, height: track.displayHeight };
    const probes = options.probes ?? (duration < 1 ? [0.2] : PROBES);
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        if (sample.timestamp <= lastTimestamp)
          throw new Error('Decoded presentation timestamps do not increase.');
        decodedSamples.push({ timestamp: sample.timestamp, duration: sample.duration });
        firstTimestamp = Math.min(firstTimestamp, sample.timestamp);
        lastTimestamp = sample.timestamp;
        videoEnd = Math.max(videoEnd, sample.timestamp + sample.duration);
        decodedFrames++;
        if (!isPresentedSample(sample, duration)) {
          terminalSamples++;
          continue;
        }
        presentedFrames++;
        sample.draw(small.context, 0, 0, 320, 180);
        const time = sample.timestamp + offset;
        const error = backgroundError(small.context, time);
        // Fade, shutter and dissolve intervals mix source colors. Other frames have one authored source frame.
        if (
          (!options.fadeIn || sample.timestamp >= 0.15) &&
          !(time >= 8.2 && time < 9.15) &&
          error > 12 &&
          failures.length < 20
        )
          failures.push({ timestamp: sample.timestamp, error });
        if (probes.some((probe) => matchesProbeTimestamp(sample.timestamp, probe))) {
          sample.draw(context, 0, 0, WIDTH, HEIGHT);
          const pose = POSES.find((candidate) => time >= candidate.start && time < candidate.end);
          selected.push({
            timestamp: sample.timestamp,
            colorError: error,
            landmark: time < 2.75 && pose ? landmark(context, pose.scale) : null,
            ...(options.effectRoi ? { effectRoi: effectRoi(context) } : {}),
            detail: Array.from(context.getImageData(928, 524, 64, 32).data).filter(
              (_, i) => i % 4 === 0
            ),
          });
        }
      } finally {
        sample.close();
      }
    }
    for await (const packet of new EncodedPacketSink(track).packets())
      packets.push({
        timestamp: packet.timestamp,
        duration: packet.duration,
        type: packet.type,
        sequence: packet.sequenceNumber,
      });
    const keys = packets
      .filter((packet) => packet.type === 'key')
      .map((packet) => packet.timestamp)
      .sort((a, b) => a - b);
    const keyGaps = keys.map((time, i) => time - (keys[i - 1] ?? 0));
    keyGaps.push(videoEnd - (keys.at(-1) ?? 0));
    const audio = await inspectAudio(input, duration);
    const seeks: { time: number; timestamp: number; colorError: number }[] = [];
    // A fresh decoder seeks in reverse order before a playback pass on that decoder.
    const seekInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    try {
      const seekTrack = await seekInput.getPrimaryVideoTrack();
      if (!seekTrack) throw new Error('Seek track is unavailable.');
      const sink = new VideoSampleSink(seekTrack);
      for (const time of options.seeks ?? (duration < 1 ? [0.3, 0.1] : [9.7, 2, 7, 0.25])) {
        const sample = await sink.getSample(time);
        if (!sample) throw new Error('Indexed seek returned no video sample.');
        try {
          sample.draw(small.context, 0, 0, 320, 180);
          seeks.push({
            time,
            timestamp: sample.timestamp,
            colorError: backgroundError(small.context, sample.timestamp + offset),
          });
        } finally {
          sample.close();
        }
      }
    } finally {
      seekInput.dispose();
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const container = inspectEnhancementContainer(bytes);
    return {
      bytes: file.size,
      dimensions,
      decodedFrames,
      presentedFrames,
      terminalSamples,
      decodedSamples,
      packetTimeline: packets,
      firstTimestamp,
      lastTimestamp,
      videoEnd,
      failures,
      selected,
      audio,
      seeks,
      container,
      packetCount: packets.length,
      keyCount: keys.length,
      maximumKeyGap: Math.max(...keyGaps),
      packetSequenceOrderValid: packets.every(
        (packet, i) =>
          packet.sequence < 0 ||
          i === 0 ||
          packets[i - 1]!.sequence < 0 ||
          packet.sequence > packets[i - 1]!.sequence
      ),
    };
  } finally {
    input.dispose();
    canvas.width = 0;
    small.canvas.width = 0;
  }
}
export async function inspectNativeEnhancement(exportId: string, options?: InspectionOptions) {
  const { getProjectExport } =
    await import('../../../apps/extension/src/composition/persistence/projects/index');
  const entry = await getProjectExport(exportId);
  if (!entry) throw new Error('Published Native export is unavailable.');
  retainedOutput = entry.file;
  return inspectEnhancementOutput(entry.file, options);
}
export function downloadEnhancementOutput(name: string) {
  if (!retainedOutput) throw new Error('No completed proof output is retained.');
  const url = URL.createObjectURL(retainedOutput),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // The download owns its URL after this task. Release the previous output before the next job.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  retainedOutput = null;
}
export const enhancementProof = {
  createFixture: createEnhancementFixture,
  schema: checkEnhancementFixtureSchema,
  gallery: renderEnhancementGallery,
  inspectNative: inspectNativeEnhancement,
  inspectFile: inspectEnhancementOutput,
  capabilities: probeEnhancementCapabilities,
  download: downloadEnhancementOutput,
};
