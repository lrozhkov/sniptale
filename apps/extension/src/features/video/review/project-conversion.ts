import {
  planReviewProjectPresentation,
  type ReviewProjectBookendResource,
} from './project-presentation';
import type { VideoProjectCompositionJoin } from '../project/scene/joins-types';
import { planReviewProjectAnnotations } from './project-annotations';
import type { VideoProjectEffectSnapshot } from '../project/effect-instance/types';
import { planReviewProjectMotion } from './project-motion';
import { materializeVideoProjectCursorSourceObservations } from '../project/cursor-source-observations';
import { planReviewProjectCursor } from './project-cursor';
import { applyRecordingReviewInteractions } from './standalone-interactions';
import { planReviewProjectScene, type ReviewProjectSceneImageResource } from './project-scene';
import { loadQuickEditAdvancedState } from './advanced/validation';
import { resolveQuickEditEffectiveFeatures } from './advanced/effective';
import { buildReviewTimeMap } from './timeline';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../project/types/model';
import { isExportReadyVideoProject } from '../project/validation/root';
import { isPlaybackRate } from '../project/validation/primitives';
import { getVideoProjectActionPresentation } from '../project/action-presentation';
import { recordingIdForProjectAsset } from '../project/source-interactions';
import type { QuickEditAdvancedContent, QuickEditUiState } from './advanced/types';
import type { ReviewDocument, ReviewSource } from './types';
import { parseReviewDocumentBaseline } from './validation';
import {
  planReviewProjectAudio,
  type ReviewProjectAudioIssue,
  type ReviewProjectAudioResources,
} from './project-audio';
import {
  planReviewProjectTimeline,
  ReviewProjectTimelineError,
  type ReviewProjectTimelinePlan,
} from './project-timeline';
import { planReviewProjectDocuments } from './project-documents';
import {
  planReviewProjectCamera,
  isNeutralReviewSeedCamera,
  type ReviewProjectCameraResource,
} from './project-camera';

type ReviewProjectConversionIssue =
  | ReviewProjectAudioIssue
  | {
      kind:
        | 'invalid-seed'
        | 'invalid-document'
        | 'changed-source'
        | 'scene-resources'
        | 'camera-resources'
        | 'unmapped-content'
        | 'source-transition'
        | 'interaction-source'
        | 'native-rate'
        | 'native-admission';
      field?: string;
    };

/** Prepared is a pure domain result; the workflow still owns resource admission and publication. */
type ReviewProjectConversionPlan =
  | { status: 'blocked'; issues: ReviewProjectConversionIssue[] }
  | { status: 'prepared'; project: VideoProject; timeline: ReviewProjectTimelinePlan };

/** Builds a detached core conversion and refuses every currently unmapped authored branch. */
export function planReviewProjectConversion(args: {
  seed: VideoProject;
  name: string;
  source: ReviewSource;
  document: ReviewDocument;
  externalAudio?: ReviewProjectAudioResources;
  camera?: ReviewProjectCameraResource;
  imageAssets?: readonly ReviewProjectSceneImageResource[];
  bookendAssets?: readonly ReviewProjectBookendResource[];
  annotationSnapshots?: readonly VideoProjectEffectSnapshot[];
  ui: QuickEditUiState;
}): ReviewProjectConversionPlan {
  const blocked = (...issues: ReviewProjectConversionIssue[]): ReviewProjectConversionPlan => ({
    status: 'blocked',
    issues,
  });
  const source = sourceTemplates(args.seed);
  if (!source) return blocked({ kind: 'invalid-seed' });
  const asset = args.seed.assets.find((asset) => asset.id === source.video.assetId)!;
  if (
    asset.metadata.width !== args.source.width ||
    asset.metadata.height !== args.source.height ||
    asset.metadata.duration !== args.source.duration ||
    asset.metadata.mimeType !== args.source.mimeType ||
    asset.metadata.size !== args.source.size ||
    args.seed.width !== args.source.width ||
    args.seed.height !== args.source.height
  )
    return blocked({ kind: 'changed-source' });
  const document = parseReviewDocumentBaseline(args.document, args.source.duration);
  if (!document) return blocked({ kind: 'invalid-document' });
  const advanced = loadQuickEditAdvancedState({ ...document.advancedContent, ui: args.ui });
  if (!advanced) return blocked({ kind: 'invalid-document', field: 'ui' });
  const application = resolveQuickEditEffectiveFeatures(advanced);
  const pending = pendingContent();
  const scene = planReviewProjectScene({
    content: document.advancedContent,
    ui: args.ui,
    source: args.source,
    ...(args.imageAssets ? { imageAssets: args.imageAssets } : {}),
  });
  if (scene.status === 'blocked')
    pending.push(
      ...scene.fields.map((field) => ({
        kind:
          field === 'scene-assets' ? ('scene-resources' as const) : ('unmapped-content' as const),
        field,
      }))
    );
  const recordingId = recordingIdForProjectAsset(asset);
  const hasFeedback =
    document.advancedContent.actionAudio !== undefined ||
    document.advancedContent.clickAnimations !== undefined ||
    document.advancedContent.keyAnimations !== undefined;
  if ((hasFeedback || document.advancedContent.cursorFocusPath) && !recordingId)
    pending.push({ kind: 'interaction-source' });
  if (
    document.advancedContent.cursorFocusPath?.segments.some(
      (segment) =>
        segment.binding.kind === 'recording-source' && segment.binding.recordingId !== recordingId
    )
  )
    pending.push({ kind: 'interaction-source', field: 'cursorFocusPath' });
  if (pending.length) return blocked(...pending);
  if (scene.status !== 'prepared') return blocked({ kind: 'native-admission' });
  let timeline: ReviewProjectTimelinePlan;
  try {
    timeline = planReviewProjectTimeline({
      operationId: args.seed.id,
      source: args.source,
      edits: document.edits,
      video: source.video,
      ...(source.audio ? { audio: source.audio } : {}),
    });
  } catch (error) {
    if (error instanceof ReviewProjectTimelineError)
      return blocked({
        kind: error.reason === 'invalid-input' ? 'invalid-seed' : 'native-admission',
        field: error.reason,
      });
    throw error;
  }
  const authoredCutTransitions = timeline.cuts.filter((cut) => cut.edit.transition !== undefined);
  const compositionJoins: VideoProjectCompositionJoin[] = authoredCutTransitions.length
    ? timeline.cuts.map((cut) => {
        const clipId = cut.incomingClipId && cut.outgoingClipId ? cut.incomingClipId : undefined;
        const recipe = {
          id: `${args.seed.id}:cut:${cut.edit.id}`,
          sampling: 'cut' as const,
          sourceRange: {
            assetId: asset.id,
            sourceInstanceId: timeline.sourceInstanceId,
            start: cut.edit.start,
            end: cut.edit.end,
          },
          ...(cut.edit.transition ? { transition: structuredClone(cut.edit.transition) } : {}),
        };
        return clipId ? { ...recipe, clipId, edge: 'start' as const } : recipe;
      })
    : [];
  if (timeline.videoClips.some((clip) => !isPlaybackRate(clip.playbackRate)))
    return blocked({ kind: 'native-rate' });
  const cursor = source.cursorTrack;
  for (const group of cursor?.sourceObservations ?? [])
    group.sourceInstanceId = timeline.sourceInstanceId;
  const documents = planReviewProjectDocuments({
    timeline,
    annotations: document.annotations,
    canvasComments: document.canvasComments,
    ...(document.advancedContent.text ? { text: document.advancedContent.text } : {}),
    ...(document.advancedContent.captions
      ? { captions: { ...document.advancedContent.captions, enabled: application.captionsApplied } }
      : {}),
  });
  const externalAudio = planReviewProjectAudio({
    operationId: args.seed.id,
    audio: document.advancedContent.audio,
    application,
    source: {
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: timeline.sourceInstanceId },
      reference: buildReviewTimeMap(args.source.duration, document.edits),
    },
    mainDuration: timeline.duration,
    originalAudioTarget: {
      assetId: asset.id,
      sourceInstanceId: (timeline.audioClips[0] ?? timeline.videoClips[0])!.sourceInstanceId!,
    },
    ...(args.externalAudio ? { resources: args.externalAudio } : {}),
  });
  if (externalAudio.status === 'blocked') return blocked(...externalAudio.issues);
  if (
    externalAudio.assets.some((asset) => args.seed.assets.some((entry) => entry.id === asset.id)) ||
    externalAudio.tracks.some((track) => args.seed.tracks.some((entry) => entry.id === track.id))
  )
    return blocked({ kind: 'audio-resources', field: 'seed-identity' });
  if (
    scene.assets.some((asset) =>
      [...args.seed.assets, ...externalAudio.assets].some((entry) => entry.id === asset.id)
    )
  )
    return blocked({ kind: 'scene-resources', field: 'identity' });
  const camera = planReviewProjectCamera({
    operationId: args.seed.id,
    webcam: document.advancedContent.webcam,
    resource: args.camera,
    applied: application.webcamApplied,
    scene: scene.scene,
    timeline,
  });
  if (!camera) return blocked({ kind: 'camera-resources' });
  const seedTracks = args.seed.tracks.filter((track) => track.role !== 'CAMERA');
  if (
    camera.assets.some((entry) =>
      [...args.seed.assets, ...externalAudio.assets, ...scene.assets].some(
        (asset) => asset.id === entry.id
      )
    ) ||
    camera.tracks.some((entry) =>
      [...args.seed.tracks, ...externalAudio.tracks].some((track) => track.id === entry.id)
    ) ||
    camera.clips.some((entry) =>
      [...timeline.videoClips, ...timeline.audioClips, ...externalAudio.clips].some(
        (clip) => clip.id === entry.id
      )
    )
  )
    return blocked({ kind: 'camera-resources', field: 'identity' });
  if (camera.clips.length) {
    timeline.videoClips = timeline.videoClips.map((clip, index) => ({
      ...clip,
      groupId: camera.clips[index]!.groupId,
      linkMode: 'LINKED',
    }));
  }
  const annotations = planReviewProjectAnnotations({
    operationId: args.seed.id,
    annotations: document.advancedContent.annotationEffects,
    snapshots: args.annotationSnapshots ?? [],
    segments: buildReviewTimeMap(args.source.duration, document.edits),
    source: { ...args.source, assetId: asset.id, sourceInstanceId: timeline.sourceInstanceId },
    scene: { width: scene.scene.width, height: scene.scene.height },
    visible: args.ui.mode === 'advanced' && args.ui.tracks.annotationEffects !== false,
    tracks: [...seedTracks, ...externalAudio.tracks, ...camera.tracks],
  });
  if (!annotations) return blocked({ kind: 'unmapped-content', field: 'annotationEffects' });
  const original = document.advancedContent.audio.original;
  const sourceMutes = (original.mutes ?? []).flatMap((mute) =>
    mute.kind === 'range'
      ? [{ id: mute.id, start: mute.start, end: mute.end, volume: mute.volume }]
      : []
  );
  const master = <T extends VideoProjectVideoClip | VideoProjectAudioClip>(clip: T) => ({
    ...clip,
    volume: original.volume,
    audioGainStart: original.volume,
    audioGainEnd: original.volume,
    muted: clip.muted || original.muted || !application.originalAudioApplied,
  });
  const minimumVersion = compositionJoins.length
    ? 40
    : annotations.clips.length
      ? 38
      : scene.scene.sceneBackground?.zoomBehavior !== undefined
        ? 37
        : scene.video.rememberedWindowLayout ||
            scene.scene.watermarkEnabled === false ||
            scene.scene.sceneBackground?.enabled !== undefined ||
            scene.scene.sceneBackground?.rememberedBlur !== undefined
          ? 36
          : scene.video.rememberedWindowHeader ||
              scene.video.rememberedSourceCrop ||
              scene.scene.rememberedCanvas
            ? 35
            : cursor?.sourceObservations
              ? 33
              : camera.clips.length
                ? 32
                : externalAudio.sourceVoiceoverDocuments.length ||
                    externalAudio.originalSpeech !== undefined
                  ? 31
                  : externalAudio.clips.length
                    ? 30
                    : documents.textDocuments.some((entry) => entry.durationMode !== undefined)
                      ? 29
                      : original.ranges?.length || sourceMutes.length
                        ? 28
                        : timeline.videoClips.some((clip) => (clip.playbackRate ?? 1) < 0.1)
                          ? 27
                          : 26;
  let project: VideoProject = {
    ...structuredClone(args.seed),
    version: args.seed.version > minimumVersion ? args.seed.version : minimumVersion,
    name: args.name,
    cursorTrack: cursor,
    duration: timeline.duration,
    ...(compositionJoins.length ? { compositionJoins } : {}),
    backgroundColor: '#00000000',
    ...scene.scene,
    assets: [
      ...structuredClone(args.seed.assets),
      ...externalAudio.assets,
      ...scene.assets,
      ...camera.assets,
    ],
    tracks: [
      ...structuredClone(seedTracks),
      ...externalAudio.tracks,
      ...camera.tracks,
      ...annotations.tracks,
    ],
    effectSnapshots: annotations.snapshots,
    effectInstances: annotations.instances,
    clips: [
      ...timeline.videoClips.map((clip) => ({ ...master(clip), ...scene.video })),
      ...timeline.audioClips.map(master),
      ...externalAudio.clips,
      ...camera.clips,
      ...annotations.clips,
    ],
    ...(original.ranges?.length || sourceMutes.length || externalAudio.originalSpeech !== undefined
      ? {
          sourceAudioDocuments: [
            {
              id: `${args.seed.id}:source-audio`,
              binding: {
                kind: 'source' as const,
                assetId: asset.id,
                sourceInstanceId: (timeline.audioClips[0] ?? timeline.videoClips[0])!
                  .sourceInstanceId!,
              },
              ranges: structuredClone(original.ranges ?? []),
              mutes: sourceMutes,
              ...(externalAudio.originalSpeech === undefined
                ? {}
                : { speech: externalAudio.originalSpeech }),
            },
          ],
        }
      : {}),
    ...(externalAudio.sourceVoiceoverDocuments.length
      ? { sourceVoiceoverDocuments: externalAudio.sourceVoiceoverDocuments }
      : {}),
    textDocuments: documents.textDocuments,
    commentDocuments: documents.commentDocuments,
    ...projectRecordingFeedback({
      seed: args.seed,
      content: document.advancedContent,
      recordingId,
      sourceInstanceId: timeline.sourceInstanceId,
      hasFeedback,
      actionsApplied: application.actionsApplied,
    }),
    ...(document.advancedContent.cameraFollowDefaults === undefined
      ? {}
      : {
          cameraFollowDefaults: structuredClone(document.advancedContent.cameraFollowDefaults),
        }),
  };
  project.cursorTrack = materializeVideoProjectCursorSourceObservations(project);
  if (document.advancedContent.cursorFocusPath && recordingId) {
    const { actionsEnabled: _enabled, ...content } = document.advancedContent;
    project = applyRecordingReviewInteractions(project, recordingId, content);
  }
  const motion = planReviewProjectMotion(
    project,
    document.advancedContent,
    application.zoomApplied
  );
  if (!motion) return blocked({ kind: 'unmapped-content', field: 'zoom' });
  project = motion;
  const presentation = planReviewProjectPresentation({
    project,
    settings: document.advancedContent.presentation,
    applied: application.presentationApplied,
    resources: args.bookendAssets ?? [],
  });
  if (presentation.status === 'blocked')
    return blocked({ kind: 'unmapped-content', field: presentation.field });
  project = presentation.project;
  if (!isExportReadyVideoProject(project)) return blocked({ kind: 'native-admission' });
  return { status: 'prepared', project, timeline };
}

function projectRecordingFeedback(args: {
  seed: VideoProject;
  content: QuickEditAdvancedContent;
  recordingId: ReturnType<typeof recordingIdForProjectAsset>;
  sourceInstanceId: string;
  hasFeedback: boolean;
  actionsApplied: boolean;
}): Pick<VideoProject, 'actionEvents' | 'actionPresentation'> &
  Partial<Pick<VideoProject, 'actionFeedback'>> {
  return {
    actionEvents: args.seed.actionEvents.map((event) => ({
      ...structuredClone(event),
      anchor:
        event.anchor.kind === 'recording-source'
          ? { ...structuredClone(event.anchor), sourceInstanceId: args.sourceInstanceId }
          : structuredClone(event.anchor),
    })),
    ...(args.recordingId &&
    (args.hasFeedback || args.seed.actionEvents.length || args.seed.actionFeedback?.length)
      ? {
          actionFeedback: [
            {
              recordingId: args.recordingId,
              sourceInstanceId: args.sourceInstanceId,
              signals: structuredClone(args.seed.actionFeedback?.[0]?.signals ?? []),
              settings: structuredClone(args.content.actionAudio ?? []),
              ...(args.content.clickAnimations === undefined
                ? {}
                : {
                    gestureStyles: structuredClone(args.content.clickAnimations),
                  }),
              ...(args.content.keyAnimations === undefined
                ? {}
                : {
                    keyStyles: structuredClone(args.content.keyAnimations),
                  }),
            },
          ],
        }
      : {}),
    actionPresentation: {
      ...getVideoProjectActionPresentation(args.seed),
      enabled: args.actionsApplied,
    },
  };
}

function sourceTemplates(seed: VideoProject): {
  video: VideoProjectVideoClip;
  audio?: VideoProjectAudioClip;
  cursorTrack: VideoProject['cursorTrack'];
} | null {
  if (
    // Raw recording facts use their own strict admission below, without the legacy 5000-key limit.
    !isExportReadyVideoProject({ ...seed, cursorTrack: null }) ||
    seed.motionRegions?.length ||
    seed.effectInstances?.length ||
    seed.effectSnapshots?.length ||
    seed.objectTracks?.length ||
    seed.transitions?.length ||
    seed.sourceAudioDocuments?.length ||
    seed.textDocuments?.length ||
    seed.commentDocuments?.length ||
    seed.sourceVoiceoverDocuments?.length ||
    seed.cursorFocusPath ||
    seed.watermark ||
    seed.sceneEdges ||
    seed.bookendPresets ||
    seed.compositionJoins?.length
  )
    return null;
  const videos = seed.clips.filter((clip) => clip.type === 'VIDEO');
  const audio = seed.clips.filter((clip) => clip.type === 'AUDIO');
  const mainVideos = videos.filter(
    (clip) => !seed.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
  );
  const video = mainVideos[0];
  if (
    !video ||
    mainVideos.length !== 1 ||
    videos.some((clip) => clip !== video && !isNeutralReviewSeedCamera(seed, clip, video)) ||
    audio.length > 1 ||
    seed.clips.length !== videos.length + audio.length ||
    (audio[0] && audio[0].assetId !== video.assetId)
  )
    return null;
  const asset = seed.assets.find((asset) => asset.id === video.assetId)!;
  const recordingId = recordingIdForProjectAsset(asset);
  if (
    seed.actionEvents.some(
      (event) =>
        event.anchor.kind !== 'recording-source' ||
        !recordingId ||
        event.anchor.recordingId !== recordingId ||
        event.anchor.sourceInstanceId !== video.sourceInstanceId
    ) ||
    (seed.actionFeedback?.length ?? 0) > 1 ||
    seed.actionFeedback?.some(
      (group) =>
        !recordingId ||
        group.recordingId !== recordingId ||
        group.sourceInstanceId !== video.sourceInstanceId ||
        group.settings.length > 0 ||
        Boolean(group.gestureStyles?.length) ||
        Boolean(group.keyStyles?.length)
    )
  )
    return null;
  const cursor = planReviewProjectCursor({
    seed,
    video,
    recordingId,
    sourceInstanceId: video.sourceInstanceId ?? video.id,
  });
  if (cursor.status !== 'prepared') return null;
  return { video, cursorTrack: cursor.track, ...(audio[0] ? { audio: audio[0] } : {}) };
}

function pendingContent(): ReviewProjectConversionIssue[] {
  // Every source field requires a deliberate mapping or a neutral-state check during implementation.
  const pending: Record<keyof QuickEditAdvancedContent, boolean> = {
    schemaVersion: false,
    text: false,
    captions: false,
    actionsEnabled: false,
    zoom: false,
    background: false,
    audio: false,
    canvas: false,
    windowHeader: false,
    webcam: false,
    watermark: false,
    annotationEffects: false,
    presentation: false,
    cameraFollowDefaults: false,
    cursorFocusPath: false,

    actionAudio: false,
    clickAnimations: false,
    keyAnimations: false,
  };
  return Object.entries(pending).flatMap(([field, unmapped]) =>
    unmapped ? [{ kind: 'unmapped-content' as const, field }] : []
  );
}
