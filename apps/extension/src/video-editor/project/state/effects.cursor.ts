import { clampNumber } from '../../../features/video/project/hydration';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { normalizeVideoProjectCursorSkin } from '../../../features/video/project/cursor';
import { VideoTemporalEasing } from '../../../features/video/project/types/index';
import { createSceneSelection } from '../selection/model';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

function createInsertedCursorSample(
  project: NonNullable<VideoEditorProjectState['project']>,
  time: number,
  previousSample:
    | NonNullable<NonNullable<VideoEditorProjectState['project']>['cursorTrack']>['samples'][number]
    | null
) {
  return {
    id: crypto.randomUUID(),
    interpolation: previousSample?.interpolation ?? VideoTemporalEasing.LINEAR,
    skinOverride: previousSample?.skinOverride ? { ...previousSample.skinOverride } : null,
    time,
    visible: previousSample?.visible ?? true,
    x: previousSample?.x ?? project.width / 2,
    y: previousSample?.y ?? project.height / 2,
  };
}

function insertIntoEmptyCursorTrack(
  project: NonNullable<VideoEditorProjectState['project']>,
  cursorTrack: NonNullable<NonNullable<VideoEditorProjectState['project']>['cursorTrack']>,
  time: number
) {
  return applyVideoProjectMutationPatch(project, {
    cursorTrack: {
      ...cursorTrack,
      samples: [createInsertedCursorSample(project, clampNumber(time, 0, project.duration), null)],
    },
  });
}

function insertIntoExistingCursorTrack(
  project: NonNullable<VideoEditorProjectState['project']>,
  cursorTrack: NonNullable<NonNullable<VideoEditorProjectState['project']>['cursorTrack']>,
  sortedSamples: NonNullable<
    NonNullable<VideoEditorProjectState['project']>['cursorTrack']
  >['samples'],
  time: number
) {
  const previousSample =
    [...sortedSamples].reverse().find((sample) => sample.time <= time) ?? sortedSamples[0] ?? null;
  const nextSample = sortedSamples.find((sample) => sample.time > time) ?? null;
  const boundedTime = clampNumber(
    time,
    (previousSample?.time ?? 0) + 0.01,
    (nextSample?.time ?? project.duration) - 0.01
  );

  return applyVideoProjectMutationPatch(project, {
    cursorTrack: {
      ...cursorTrack,
      samples: [
        ...cursorTrack.samples,
        createInsertedCursorSample(project, boundedTime, previousSample),
      ].sort((left, right) => left.time - right.time),
    },
  });
}

export function createCursorSampleInserter(set: VideoEditorStoreSet) {
  return (time: number) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const cursorTrack = project.cursorTrack;
        if (!cursorTrack) {
          return project;
        }

        const sortedSamples = [...cursorTrack.samples].sort(
          (left, right) => left.time - right.time
        );
        if (sortedSamples.length === 0) {
          return insertIntoEmptyCursorTrack(project, cursorTrack, time);
        }

        return insertIntoExistingCursorTrack(project, cursorTrack, sortedSamples, time);
      })
    );
}

export function createCursorSampleDeleter(set: VideoEditorStoreSet) {
  return (sampleId: string) =>
    set((state) => {
      if (!state.project?.cursorTrack) {
        return {};
      }

      const nextSamples = state.project.cursorTrack.samples.filter(
        (sample) => sample.id !== sampleId
      );
      return {
        ...applyProjectUpdate(state, (project) =>
          applyVideoProjectMutationPatch(project, {
            cursorTrack:
              nextSamples.length === 0
                ? null
                : {
                    ...project.cursorTrack!,
                    samples: nextSamples,
                  },
          })
        ),
        selection:
          state.selection.kind === VideoEditorSelectionKind.CURSOR_SEGMENT &&
          state.selection.sampleId === sampleId
            ? createSceneSelection()
            : state.selection,
      };
    });
}

export function createCursorVisibilityUpdater(set: VideoEditorStoreSet) {
  return (sampleId: string, visible: boolean) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          cursorTrack: project.cursorTrack
            ? {
                ...project.cursorTrack,
                samples: project.cursorTrack.samples.map((sample) =>
                  sample.id === sampleId ? { ...sample, visible } : sample
                ),
              }
            : project.cursorTrack,
        })
      )
    );
}

export function createCursorInterpolationUpdater(set: VideoEditorStoreSet) {
  return (
    sampleId: string,
    interpolation: Parameters<VideoEditorProjectState['updateCursorSampleInterpolation']>[1]
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          cursorTrack: project.cursorTrack
            ? {
                ...project.cursorTrack,
                samples: project.cursorTrack.samples.map((sample) =>
                  sample.id === sampleId ? { ...sample, interpolation } : sample
                ),
              }
            : project.cursorTrack,
        })
      )
    );
}

export function createCursorSkinOverrideUpdater(set: VideoEditorStoreSet) {
  return (
    sampleId: string,
    patch: Parameters<VideoEditorProjectState['updateCursorSampleSkinOverride']>[1]
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          cursorTrack: project.cursorTrack
            ? {
                ...project.cursorTrack,
                samples: project.cursorTrack.samples.map((sample) => {
                  if (sample.id !== sampleId) {
                    return sample;
                  }

                  const baseSkin = project.cursorTrack?.skin;
                  return {
                    ...sample,
                    skinOverride: normalizeVideoProjectCursorSkin({
                      ...(sample.skinOverride ?? baseSkin),
                      ...patch,
                    }),
                  };
                }),
              }
            : project.cursorTrack,
        })
      )
    );
}

export function createCursorSkinOverrideClearer(set: VideoEditorStoreSet) {
  return (sampleId: string) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          cursorTrack: project.cursorTrack
            ? {
                ...project.cursorTrack,
                samples: project.cursorTrack.samples.map((sample) =>
                  sample.id === sampleId ? { ...sample, skinOverride: null } : sample
                ),
              }
            : project.cursorTrack,
        })
      )
    );
}
