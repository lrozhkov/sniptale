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

type SceneEdgeProject = { duration: number; sceneEdges?: VideoProjectSceneEdges };

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

/** Native uses project seconds; Gallery retains its separate tick/sample adapters. */
export function resolveVideoProjectSceneEdgePlan(project: SceneEdgeProject) {
  const settings = project.sceneEdges;
  const visualEnvelope = constrainPresentationEnvelope(
    project.duration,
    settings?.intro.enabled ? settings.intro.duration : 0,
    settings?.outro.enabled ? settings.outro.duration : 0
  );
  return {
    visualEnvelope,
    audioEnvelope: {
      span: visualEnvelope.span,
      fadeIn: settings?.intro.audioFade ? visualEnvelope.fadeIn : 0,
      fadeOut: settings?.outro.audioFade ? visualEnvelope.fadeOut : 0,
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
