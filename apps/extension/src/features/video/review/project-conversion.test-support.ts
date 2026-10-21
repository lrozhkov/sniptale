import { createCameraFollowSettings } from '../project/camera/cursor-policy';
import { patchReviewKeys } from '../project/action-feedback/key-animation';
import { patchReviewClicks } from './advanced/click-animation';
import type {
  SourceNormalizedRecordingActionEvent,
  RecordingTelemetrySignal,
} from '../project/types';
import { createQuickEditAdvancedState } from './advanced/defaults';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import { createReviewCaptionSettings } from './text-document';
import type { ReviewDocument } from './types';

export function fixture() {
  const source = { width: 640, height: 360, duration: 8, mimeType: 'video/webm', size: 100 };
  const seed = createVideoProjectFromRecording({
    ...source,
    recordingId: 'recording',
    filename: 'Original.webm',
    hasAudio: true,
  });
  seed.id = 'conversion-1';
  const document: ReviewDocument = {
    annotations: [{ id: 'note', text: 'Keep', anchor: { kind: 'point', time: 2 } }],
    canvasComments: [],
    edits: [{ id: 'cut', kind: 'cut', start: 3, end: 4, requestedStart: 3, requestedEnd: 4 }],
    advancedContent: {
      ...createQuickEditAdvancedContent(),
      text: {
        version: 1,
        fragments: [
          {
            id: 'text',
            start: 1,
            end: 2,
            originalText: 'Text',
            text: 'Text',
            revision: 0,
            timingRevision: 0,
            timeDomain: 'source',
            alignment: 'range',
            showInVideo: true,
          },
        ],
      },
      captions: { ...createReviewCaptionSettings(), enabled: true },
    },
  };
  const ui = createQuickEditAdvancedState().ui;
  ui.mode = 'advanced';
  ui.tracks = { ...ui.tracks, audio: true, text: true, voiceover: true, music: true };
  return {
    source,
    seed,
    document,
    name: 'Edited review',
    ui,
  };
}

export function externalAudioFixture() {
  const input = fixture();
  const asset = {
    createdAt: input.seed.createdAt,
    id: 'new-audio',
    type: 'AUDIO' as const,
    name: 'Music.wav',
    source: { kind: 'project-asset' as const, projectAssetId: 'new-owned-audio' },
    metadata: {
      width: 0,
      height: 0,
      duration: 4,
      size: 100,
      mimeType: 'audio/wav',
      hasAudio: true,
      audioPeaks: null,
    },
  };
  const track = (id: string) => ({
    id,
    name: id,
    order: 3,
    visible: true,
    locked: false,
    kind: 'AUDIO' as const,
  });
  input.document.advancedContent.audio.laneVolumes = { voiceover: 2, music: 0.4 };
  input.document.advancedContent.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'project-asset:gallery',
      sourceOffset: 0.5,
      timelineStart: 1,
      duration: 1,
      tempo: 0.25,
      volume: 2,
      muted: false,
      fadeIn: 0.25,
      fadeOut: 0.5,
    },
  ];
  input.document.advancedContent.audio.music = [
    {
      id: 'music',
      assetId: 'project-asset:gallery',
      sourceOffset: 1,
      timelineStart: 2,
      duration: 3,
      volume: 0.5,
      muted: false,
      fadeIn: 1,
      fadeOut: 1,
    },
  ];
  return {
    ...input,
    externalAudio: {
      assets: [{ reviewAssetId: 'project-asset:gallery', asset }],
      tracks: { voiceover: track('voice-track'), music: track('music-track') },
    },
  };
}

export function actionFixture() {
  const input = fixture();
  const events: SourceNormalizedRecordingActionEvent[] = [
    {
      id: 'click',
      kind: 'CLICK',
      time: 1,
      duration: 0.1,
      point: { x: 0.4, y: 0.6 },
      label: '',
      preset: 'NONE',
      data: {},
    },
    {
      id: 'key',
      kind: 'KEY',
      time: 5,
      duration: 0.2,
      point: null,
      label: 'Ctrl+K',
      preset: 'NONE',
      data: {},
    },
    {
      id: 'hidden',
      kind: 'KEY',
      time: 3.5,
      duration: 0.1,
      point: null,
      label: 'Alt+K',
      preset: 'NONE',
      data: {},
    },
  ];
  const signals: RecordingTelemetrySignal[] = [
    {
      id: 'typing',
      kind: 'typing',
      startTime: 4,
      endTime: 7,
      point: null,
      data: { activity: 'keyboard', captureSegment: 0 },
    },
  ];
  input.seed = createVideoProjectFromRecording({
    ...input.source,
    recordingId: 'recording',
    filename: 'Original.webm',
    hasAudio: true,
    sourceNormalizedActionEvents: events,
    recordingSignals: signals,
  });
  input.seed.id = 'conversion-1';
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 4,
    end: 6,
    requestedStart: 4,
    requestedEnd: 6,
    rate: 2,
    audio: 'speed',
  });
  input.document.advancedContent.actionAudio = events.map((event) => ({
    ref: { kind: 'action' as const, id: event.id },
    enabled: true,
    presetId: event.kind === 'CLICK' ? 'mouse-classic-paired-v2' : 'keyboard-recorded-v2',
    volume: 0.4,
    offset: 0.05,
    downEnabled: true,
    upEnabled: false,
    downGain: 0.8,
    upGain: 0.2,
    includeRepeats: true,
  }));
  input.document.advancedContent.actionAudio.push({
    ref: { kind: 'signal', id: 'typing' },
    enabled: true,
    presetId: 'typing-natural-v1',
    volume: 0.2,
    offset: 0,
  });
  input.document.advancedContent.actionAudio.sort(
    (left, right) =>
      left.ref.kind.localeCompare(right.ref.kind) || left.ref.id.localeCompare(right.ref.id)
  );
  input.document.advancedContent.clickAnimations = patchReviewClicks([], ['click'], {
    effect: 'magnify',
    magnification: 2,
    lensShape: 'rounded',
    lensShadow: 40,
  });
  input.document.advancedContent.keyAnimations = patchReviewKeys([], ['key', 'hidden'], {
    enabled: true,
    after: 0.5,
    style: { fontSize: 32 },
  });
  input.document.advancedContent.cameraFollowDefaults = createCameraFollowSettings('fast');
  return { input, events, signals };
}
