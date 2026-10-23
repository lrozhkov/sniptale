import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import {
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../apps/extension/src/features/video/project/factories/clip';
import {
  createAnnotationClip,
  createShapeClip,
  createTextClip,
} from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { createVideoProjectCursorTrack } from '../../../../apps/extension/src/features/video/project/defaults';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { syncProjectTransitions } from '../../../../apps/extension/src/features/video/project/transition/project';
import { addVideoProjectManualText } from '../../../../apps/extension/src/features/video/project/text/authoring';
import { BUILT_IN_VIDEO_ANNOTATION_PACKS } from '../../../../apps/extension/src/features/video/project/annotation-engine';
import {
  VideoOverlayTemplateKind,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoProjectShapeType,
  VideoTemporalEasing,
  VideoTrackKind,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../../../apps/extension/src/features/video/project/types';

/** Uses supported creation owners; each clip exposes a distinct inspector parameter family. */
export function createInspectorAuditFixture() {
  const recording = {
    recordingId: 'beta-v1-recording',
    filename: 'Audit screen with a deliberately long descriptive source name.webm',
    width: 1280,
    height: 720,
    duration: 12,
    mimeType: 'video/webm',
    size: 1024,
  };
  let project = createVideoProjectFromMultiSourceRecording({
    name: 'Inspector audit / Проверка инспектора',
    videos: [recording],
    webcamVideo: { ...recording, recordingId: 'audit-camera', filename: 'Camera.webm' },
    microphoneAudio: { ...recording, recordingId: 'audit-microphone', filename: 'Audio.webm' },
  });
  // Independent selection is required for camera, video, and audio field inventories.
  project.clips = project.clips.map((clip) => ({ ...clip, groupId: null }));
  const overlayTrack = createVideoProjectTrack('Inspector variants', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(overlayTrack);
  const text = createTextClip(overlayTrack.id, project.width, project.height, 0);
  text.text = 'Editable inspector text / Редактируемый текст';
  const shapes = Object.values(VideoProjectShapeType).map((kind, index) =>
    createShapeClip(overlayTrack.id, project.width, project.height, 4 + index * 4, kind)
  );
  const annotations = Object.values(VideoOverlayTemplateKind).map((kind, index) =>
    createAnnotationClip(overlayTrack.id, project.width, project.height, 22 + index * 4, kind)
  );
  const modern = createModernAnnotations(project, overlayTrack.id);
  project.clips.push(text, ...shapes, ...annotations, ...modern.clips);
  const image = createAuditImage(project, overlayTrack.id);
  project.clips.push(image.first, image.second);
  project.transitions = [
    {
      id: 'audit-transition',
      leadingClipId: image.first.id,
      trailingClipId: image.second.id,
      kind: VideoTransitionKind.CROSSFADE,
      easing: VideoTransitionEasing.EASE_IN_OUT,
      duration: 1,
    },
  ];
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    samples: [0, 1, 2].map((time) => ({
      id: `audit-cursor-${time}`,
      time,
      x: 160 + time * 120,
      y: 180,
      visible: true,
      interpolation: VideoTemporalEasing.LINEAR,
    })),
  };
  project.actionEvents = [
    {
      id: 'audit-click',
      kind: VideoProjectActionEventKind.CLICK,
      capturedDuration: 0.2,
      label: 'Primary click / Основной щелчок',
      data: { button: 'primary' },
      point: { x: 300, y: 200 },
      presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
      anchor: { kind: 'project', time: 1 },
    },
    {
      id: 'audit-key',
      kind: VideoProjectActionEventKind.KEY,
      capturedDuration: 0.5,
      label: 'Ctrl+Shift+Alt+Inspector',
      data: { combo: 'Ctrl+Shift+A', key: 'a' },
      point: null,
      presentation: { preset: VideoProjectActionPreset.NONE },
      anchor: { kind: 'project', time: 3 },
    },
  ];
  const motion = createVideoProjectMotionRegion(project, 1);
  motion.duration = 1;
  const connected = createVideoProjectMotionRegion(project, 4);
  connected.incomingConnection = { fromRegionId: motion.id, easing: VideoTemporalEasing.LINEAR };
  project.motionRegions = [motion, connected];
  project.objectTracks = [
    {
      id: 'audit-object',
      kind: 'visualCursor',
      source: 'visualDetection',
      samples: [0, 1, 2].map((time) => ({
        confidence: time === 1 ? 0.25 : 0.95,
        time,
        visible: true,
        x: 200 + time * 100,
        y: 240,
      })),
    },
  ];
  const added = addVideoProjectManualText(project, {
    documentId: 'audit-document',
    fragmentId: 'audit-phrase',
    start: 0,
  });
  if (!added.ok) throw new Error('Inspector audit document creation failed');
  project = added.project;
  added.entry.document.fragments[0]!.text =
    'A deliberately long phrase for the actual inspector, with English and русский текст, that must retain its complete native title.';
  if (added.entry.captions) added.entry.captions.enabled = true;
  project.duration = Math.max(...project.clips.map((clip) => clip.startTime + clip.duration));
  project = syncProjectTransitions(project);
  const captureClipIds = new Set([
    ...project.clips.filter((clip) => clip.type !== 'ANNOTATION').map((clip) => clip.id),
    annotations[0]!.id,
    annotations.find((clip) => clip.templateKind === VideoOverlayTemplateKind.CALLOUT_CONNECTOR)!
      .id,
    ...modern.captureIds,
  ]);
  return {
    project,
    text,
    shapes,
    annotations,
    modern: modern.clips,
    captureClipIds,
    motion,
    connected,
    image,
  };
}

function createModernAnnotations(project: VideoProject, trackId: string) {
  const captured = new Set<string>();
  const captureIds: string[] = [];
  let index = 0;
  const clips = BUILT_IN_VIDEO_ANNOTATION_PACKS.flatMap((pack) =>
    Object.values(pack.templates).flatMap((templates) =>
      templates.map((template) => {
        const clip = createAnnotationClip(
          trackId,
          project.width,
          project.height,
          124 + index++ * 8,
          {
            pack,
            template,
            packLabel: pack.label,
            packTheme: pack.theme,
            templateRef: { packId: pack.packId, templateId: template.id },
          }
        );
        if (!captured.has(template.target.kind)) {
          captured.add(template.target.kind);
          captureIds.push(clip.id);
        }
        return clip;
      })
    )
  );
  return { clips, captureIds };
}

function createAuditImage(project: VideoProject, trackId: string) {
  const asset = createVideoProjectAsset(
    'Audit image',
    VideoProjectAssetType.IMAGE,
    { kind: 'recording', recordingId: 'audit-image' },
    {
      width: 640,
      height: 360,
      duration: 5,
      mimeType: 'image/svg+xml',
      size: 200,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets.push(asset);
  const first = createVideoClipFromAsset(trackId, asset, project.width, project.height, 110);
  const second = createVideoClipFromAsset(trackId, asset, project.width, project.height, 114);
  first.duration = 5;
  second.duration = 5;
  return { first, second };
}
