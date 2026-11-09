import { planReviewProjectConversion } from '../../features/video/review/project-conversion';
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../features/video/review/advanced/defaults';
import type { ReviewSource, ReviewEdit } from '../../features/video/review/types';
import type { ReviewActionAudioSetting } from '../../features/video/review/advanced/action-audio';
import { ACTION_SOUND_CATALOG } from '../../features/video/review/action-audio-catalog';
import {
  createReviewActionAudioAdmission,
  iterateReviewActionAudioCues,
  type ReviewActionAudioPlan,
} from '../../features/video/review/action-audio';
import { buildProjectActionAudioPlan } from '../../features/video/review/project-action-audio';
import { recordingEventProjectSources } from '../../features/video/project/recording-events/project-facts';
import type { VideoProject } from '../../features/video/project/types';
import { createRecordingEventsRenderer } from './recording-events';

type Admission = ReturnType<ReturnType<typeof createReviewActionAudioAdmission>['finish']> & {
  firstCueTime: number | null;
};
const SCAN_WINDOW_SECONDS = 30;
const SAMPLE_TAIL_SECONDS = Math.max(
  ...Object.values(ACTION_SOUND_CATALOG).map((sample) => sample.durationFrames / 44100)
);

/** A job owns stable global admission and bounded event readers for later cue windows. */
export function createRecordingProjectActionAudioSource(
  project: VideoProject,
  dependencies = { createRenderer: createRecordingEventsRenderer }
) {
  project = structuredClone(project);
  const lifetime = new AbortController();
  const renderer = dependencies.createRenderer();
  const generations = new Map<string, string>();
  let admission: Promise<Admission> | null = null;
  let scan: ReturnType<typeof createRecordingEventsRenderer> | null = null;
  let reading = false;
  const scopedSignal = (signal?: AbortSignal) =>
    signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
  const plan = async (
    owner: ReturnType<typeof createRecordingEventsRenderer>,
    range: { start: number; end: number },
    signal: AbortSignal
  ): Promise<ReviewActionAudioPlan> => {
    signal.throwIfAborted();
    const prepared = await owner.prepare(
      project,
      { start: Math.max(0, range.start - SAMPLE_TAIL_SECONDS), end: range.end },
      signal
    );
    signal.throwIfAborted();
    for (const source of recordingEventProjectSources(prepared)) {
      const key = JSON.stringify([source.recordingId, source.eventStreamId]);
      const previous = generations.get(key);
      if (previous !== undefined && previous !== source.writerGeneration)
        throw new Error('Recording action audio source changed.');
      generations.set(key, source.writerGeneration);
    }
    return buildProjectActionAudioPlan(prepared);
  };
  return {
    duration: project.duration,
    admit(signal?: AbortSignal): Promise<Admission> {
      const active = scopedSignal(signal);
      active.throwIfAborted();
      if (admission) return admission;
      const owner = dependencies.createRenderer();
      scan = owner;
      const pending = (async () => {
        const state = createReviewActionAudioAdmission();
        let firstCueTime: number | null = null;
        try {
          for (let start = 0; start < project.duration; start += SCAN_WINDOW_SECONDS) {
            const range = { start, end: Math.min(project.duration, start + SCAN_WINDOW_SECONDS) };
            const prepared = await plan(owner, range, active);
            for (const batch of iterateReviewActionAudioCues(prepared, range)) {
              active.throwIfAborted();
              // A tail can overlap the next scan window. Its original onset enters admission once.
              const onsets = batch.filter(
                (cue) => cue.start >= range.start && cue.start < range.end
              );
              for (const cue of onsets)
                firstCueTime = Math.min(firstCueTime ?? cue.start, cue.start);
              state.append(onsets);
            }
            active.throwIfAborted();
          }
          return { ...state.finish(), firstCueTime };
        } finally {
          owner.clear();
          if (scan === owner) scan = null;
        }
      })();
      admission = pending;
      void pending.catch(() => {
        if (admission === pending) admission = null;
      });
      return pending;
    },
    async readWindow(
      range: { start: number; end: number },
      signal?: AbortSignal
    ): Promise<ReviewActionAudioPlan> {
      if (reading) throw new Error('Recording action audio window read is already active.');
      reading = true;
      try {
        return await plan(renderer, range, scopedSignal(signal));
      } finally {
        reading = false;
      }
    },
    dispose() {
      lifetime.abort();
      renderer.clear();
      scan?.clear();
      scan = null;
      generations.clear();
    },
  };
}

export type RecordingProjectActionAudioSource = ReturnType<
  typeof createRecordingProjectActionAudioSource
>;

/** Cuts, speed and sound settings use the same pure conversion as project promotion. */
export function createReviewRecordingActionAudioSource(
  args: {
    project: VideoProject;
    source: ReviewSource;
    edits: readonly ReviewEdit[];
    settings: readonly ReviewActionAudioSetting[];
    applied: boolean;
  },
  dependencies = { createRenderer: createRecordingEventsRenderer }
) {
  if (
    !args.applied ||
    !args.settings.some(
      (setting) => setting.enabled && setting.presetId !== null && setting.volume > 0
    ) ||
    !args.project.actionFeedback?.some((group) => group.events && group.events.totalBlocks > 0)
  )
    return null;
  const result = planReviewProjectConversion({
    seed: args.project,
    source: args.source,
    name: args.project.name,
    document: {
      annotations: [],
      canvasComments: [],
      edits: structuredClone([...args.edits]),
      advancedContent: {
        ...createQuickEditAdvancedContent(),
        actionsEnabled: true,
        actionAudio: structuredClone([...args.settings]),
      },
    },
    ui: { ...createQuickEditAdvancedState().ui, mode: 'advanced' },
  });
  if (result.status !== 'prepared')
    throw new Error('Recording action audio conversion failed.', { cause: result.issues });
  return createRecordingProjectActionAudioSource(result.project, dependencies);
}
