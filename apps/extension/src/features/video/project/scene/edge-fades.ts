import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isBoundedNumber } from '../validation/primitives';

/** Authored seconds remain intact when the available composition span changes. */
export interface PresentationFade {
  enabled: boolean;
  duration: number;
  color?: string;
  audioFade?: boolean;
}

/** Independent authored edge; legacy scalar fields are fallback only when this is absent. */
export interface PresentationEdgeControl {
  mode: 'none' | 'fade' | 'media';
  plain: PresentationFade;
  media: PresentationFade;
}

/** Admits active and remembered edge variants without resolving their resources. */
export function parsePresentationEdgeControl(value: unknown): PresentationEdgeControl | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['mode', 'plain', 'media'].includes(key)) ||
    (value['mode'] !== 'none' && value['mode'] !== 'fade' && value['mode'] !== 'media')
  )
    return null;
  const plain = parsePresentationFade(value['plain']);
  const media = parsePresentationFade(value['media']);
  return plain && media ? { mode: value['mode'], plain, media } : null;
}

/** Derived seconds on the complete composition clock. */
export interface PresentationEnvelope {
  span: number;
  fadeIn: number;
  fadeOut: number;
}

/** Final scene presentation is independent from each clip's own fades. */
export interface VideoProjectSceneEdges {
  intro: PresentationFade;
  outro: PresentationFade;
}

type SceneEdgeProject = { duration: number; fps?: number; sceneEdges?: VideoProjectSceneEdges };

/** Neutral defaults do not opt an existing document into processing. */
export function createPresentationFade(): PresentationFade {
  return { enabled: false, duration: 0.4 };
}

/** Preserves independent remembered values for both scene edges. */
export function createVideoProjectSceneEdges(): VideoProjectSceneEdges {
  return { intro: createPresentationFade(), outro: createPresentationFade() };
}

/** Shared admission retains omission of inherited color and audio settings. */
export function parsePresentationFade(value: unknown): PresentationFade | null {
  if (!isRecord(value)) return null;
  const color =
    value['color'] === undefined
      ? undefined
      : typeof value['color'] === 'string'
        ? normalizePaintColor(value['color'])
        : null;
  if (
    Object.keys(value).some(
      (key) => !['enabled', 'duration', 'color', 'audioFade'].includes(key)
    ) ||
    typeof value['enabled'] !== 'boolean' ||
    !isBoundedNumber(value['duration'], 0, 60) ||
    (color !== undefined && (!color || !color.endsWith('ff'))) ||
    (value['audioFade'] !== undefined && typeof value['audioFade'] !== 'boolean')
  )
    return null;
  return {
    enabled: value['enabled'],
    duration: value['duration'],
    ...(color === undefined ? {} : { color }),
    ...(typeof value['audioFade'] === 'boolean' ? { audioFade: value['audioFade'] } : {}),
  };
}

/** Refuses the complete branch if either active or remembered edge is invalid. */
export function parseVideoProjectSceneEdges(value: unknown): VideoProjectSceneEdges | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'intro' && key !== 'outro'))
    return null;
  const intro = parsePresentationFade(value['intro']);
  const outro = parsePresentationFade(value['outro']);
  return intro && outro ? { intro, outro } : null;
}

/** Proportional limiting keeps both edges without changing authored durations. */
export function constrainPresentationEnvelope(
  span: number,
  fadeIn: number,
  fadeOut: number
): PresentationEnvelope {
  const scale = fadeIn + fadeOut > span ? span / (fadeIn + fadeOut) : 1;
  return { span, fadeIn: fadeIn * scale, fadeOut: fadeOut * scale };
}

/** Opacity clamps to the composition endpoints, including final audio samples. */
export function presentationEnvelopeOpacity(envelope: PresentationEnvelope, position: number) {
  if (Number.isNaN(position)) throw new Error('Invalid presentation envelope position.');
  const time = Math.max(0, Math.min(envelope.span, position));
  const incoming = envelope.fadeIn > 0 ? Math.max(0, 1 - time / envelope.fadeIn) : 0;
  const outgoing =
    envelope.fadeOut > 0 ? Math.max(0, 1 - (envelope.span - time) / envelope.fadeOut) : 0;
  return Math.max(incoming, outgoing);
}

/** Uses the last output frame and sample, while authored seconds remain unchanged. */
export function resolveVideoProjectSceneEdgePlan(
  project: SceneEdgeProject,
  fps = project.fps ?? 30,
  sampleRate = 48_000
) {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error('Invalid presentation sampling rate.');
  const settings = project.sceneEdges;
  const durationUs = Math.round(project.duration * 1_000_000);
  // Native playback and join sampling share the same minimum cadence.
  const visualFps = Math.max(1, fps);
  // A rounded frame timestamp belongs to the half-open output interval.
  const frames = Math.max(1, Math.ceil(((durationUs - 0.5) * visualFps) / 1_000_000));
  const visualSpan = Math.max(0, Math.round(((frames - 1) * 1_000_000) / visualFps) / 1_000_000);
  const audioSpan = Math.max(
    0,
    (Math.round((durationUs * sampleRate) / 1_000_000) - 1) / sampleRate
  );
  const fadeIn = settings?.intro.enabled ? settings.intro.duration : 0;
  const fadeOut = settings?.outro.enabled ? settings.outro.duration : 0;
  const visualEnvelope = constrainPresentationEnvelope(visualSpan, fadeIn, fadeOut);
  const audioEnvelope = constrainPresentationEnvelope(audioSpan, fadeIn, fadeOut);
  return {
    visualEnvelope,
    audioEnvelope: {
      span: audioEnvelope.span,
      fadeIn: settings?.intro.audioFade ? audioEnvelope.fadeIn : 0,
      fadeOut: settings?.outro.audioFade ? audioEnvelope.fadeOut : 0,
    },
    color: settings?.intro.color ?? '#000000ff',
    endColor: settings?.outro.color ?? '#000000ff',
  };
}

/** Final output gain does not alter source, clip or nested effect plans. */
export function getVideoProjectSceneEdgeAudioGain(project: SceneEdgeProject, time: number) {
  return (
    1 - presentationEnvelopeOpacity(resolveVideoProjectSceneEdgePlan(project).audioEnvelope, time)
  );
}
