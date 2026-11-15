import { getTrackJunctions } from './junctions';
import { z } from 'zod';
import { createGlTransitionSelection, parseGlTransitionSelection } from './gl-catalog';
import type { VideoProject, VideoProjectTransition } from '../types';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../validation/primitives';

const boundary = z.strictObject({
  id: z.string().min(1).max(512),
  leadingClipId: z.string().min(1).max(512),
  trailingClipId: z.string().min(1).max(512),
  duration: z.number().finite().min(0).max(MAX_VIDEO_PROJECT_DURATION_SECONDS),
  easing: z.enum(['LINEAR', 'EASE_IN_OUT']),
});
const schema = z.discriminatedUnion('kind', [
  boundary.extend({ kind: z.literal('audio') }),
  boundary.extend({
    kind: z.literal('gl'),
    selection: z.unknown(),
    presetId: z.string().min(1).max(512).optional(),
  }),
]);

/** Admit only complete explicit boundaries. Legacy styles and unknown implementations are refused. */
export function parseVideoProjectTransition(value: unknown): VideoProjectTransition | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.leadingClipId === parsed.data.trailingClipId) return null;
  if (parsed.data.kind === 'audio') return parsed.data;
  const selection = parseGlTransitionSelection(parsed.data.selection);
  const { presetId, ...base } = parsed.data;
  return selection ? { ...base, selection, ...(presetId !== undefined ? { presetId } : {}) } : null;
}

/** Only newly authored visual boundaries receive the bundled Fade default. */
export function createDefaultVideoProjectTransition(
  boundary: Pick<
    VideoProjectTransition,
    'id' | 'leadingClipId' | 'trailingClipId' | 'duration' | 'easing'
  >,
  audio: boolean
): VideoProjectTransition {
  if (audio) return { ...boundary, kind: 'audio' };
  const selection = createGlTransitionSelection('Fade');
  if (!selection) throw new Error('Bundled default transition is unavailable.');
  return { ...boundary, kind: 'gl', selection };
}

/** References must select one actual same-lane junction with the matching audio/visual domain. */
export function hasValidVideoProjectTransitionReferences(project: VideoProject): boolean {
  if (!project.transitions?.length) return true;
  const junctions = new Map(
    getTrackJunctions(project).map((junction) => [
      JSON.stringify([junction.leadingClip.id, junction.trailingClip.id]),
      junction,
    ])
  );
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const transition of project.transitions) {
    const pair = JSON.stringify([transition.leadingClipId, transition.trailingClipId]);
    const junction = junctions.get(pair);
    if (
      !junction ||
      ids.has(transition.id) ||
      pairs.has(pair) ||
      (transition.kind === 'audio') !== (junction.leadingClip.type === 'AUDIO')
    )
      return false;
    ids.add(transition.id);
    pairs.add(pair);
  }
  return true;
}
