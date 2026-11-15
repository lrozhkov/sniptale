import { resolveVideoCompositionActions } from '../../../features/video/composition/timeline/frame/actions';
import { patchSourceInteractionFeedback } from '../../../features/video/project/source-interaction-authoring';
import { patchReviewClicks } from '../../../features/video/review/advanced/click-animation';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import { resolveVideoProjectActionPresentations } from '../../../features/video/project/action-presentation';
import { parseHydratableVideoProject } from '../../../features/video/project/validation/root';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { undoVideoEditorProjectHistory } from '../history';

function fixture(generic: boolean) {
  const seed = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = seed.clips.find((clip) => clip.type === 'VIDEO')!;
  const project = applyVideoProjectMutationPatch(
    generic
      ? {
          ...seed,
          source: { kind: 'manual' },
          baseRecordingId: null,
          assets: seed.assets.map((asset) => ({
            ...asset,
            source: { kind: 'project-asset', projectAssetId: 'source-bytes' },
          })),
          actionFeedback: [],
        }
      : seed,
    {
      sourceInteractionDocuments: [
        {
          id: 'inputs',
          binding: { assetId: clip.assetId, sourceInstanceId: clip.sourceInstanceId! },
          cursorMotions: [],
          cursorEnabled: false,
          keyboardEnabled: true,
          mouseEnabled: true,
          timeline: {
            presses: [
              {
                id: 'manual-key',
                family: 'keyboard',
                start: 1,
                end: 1.2,
                label: 'Cmd+K',
                keys: ['Cmd', 'K'],
                button: 0,
                x: 0.4,
                y: 0.5,
              },
              {
                id: 'manual-click',
                family: 'mouse',
                start: 3,
                end: 3.1,
                label: 'Click',
                button: 0,
                x: 0.3,
                y: 0.2,
              },
            ],
            overrides: [],
          },
        },
      ],
    }
  );
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(project);
  return { store, clip };
}
it.each([false, true])(
  'edits transferred manual events through Native history and reopen (generic=%s)',
  (generic) => {
    const { store, clip } = fixture(generic);
    const original = store.getState().project!;
    const rows = resolveVideoProjectActionPresentations(original);
    const key = rows.find((row) => row.occurrence.event.kind === 'KEY')!;
    store.getState().updateActionEventDetails(key.occurrence.eventId, {
      clipId: clip.id,
      time: key.animationStart + 0.5,
    });
    const moved = store.getState().project!;
    expect(moved).not.toBe(original);
    const movedKey = resolveVideoProjectActionPresentations(moved).find(
      (row) => row.occurrence.eventId === key.occurrence.eventId
    )!;
    expect(movedKey.animationStart).toBeCloseTo(key.animationStart + 0.5, 8);
    store.getState().updateActionEventDetails(key.occurrence.eventId, {
      clipId: clip.id,
      presentation: { enabled: false },
    });
    const disabled = store.getState().project!;
    expect(
      resolveVideoProjectActionPresentations(disabled).find(
        (row) => row.occurrence.eventId === key.occurrence.eventId
      )?.reason
    ).toBe('event-disabled');
    const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(disabled)))!;
    expect(reopened).not.toBeNull();
    expect(
      resolveVideoProjectActionPresentations(reopened).find(
        (row) => row.occurrence.eventId === key.occurrence.eventId
      )?.reason
    ).toBe('event-disabled');
    const click = resolveVideoProjectActionOccurrences(disabled).find(
      (row) => row.event.kind === 'CLICK'
    )!;
    store
      .getState()
      .updateActionEventDetails(click.eventId, { clipId: clip.id, point: { x: 0.6, y: 0.7 } });
    expect(
      resolveVideoProjectActionOccurrences(store.getState().project!).find(
        (row) => row.eventId === click.eventId
      )?.event.point
    ).toEqual({ x: 0.6, y: 0.7 });
    expect(store.getState().project!.actionEvents).toEqual(original.actionEvents);
    const undo = undoVideoEditorProjectHistory(
      store.getState().projectHistory,
      store.getState().project!
    );
    expect(undo?.status).toBe('applied');
    if (undo?.status === 'applied')
      expect(undo.project.sourceInteractionDocuments).toEqual(disabled.sourceInteractionDocuments);
    store.getState().deleteActionEvent(click.eventId);
    expect(
      resolveVideoProjectActionOccurrences(store.getState().project!).some(
        (row) => row.eventId === click.eventId
      )
    ).toBe(false);
  }
);
it('refuses invalid or locked transferred action commands without changing history', () => {
  const { store, clip } = fixture(false),
    before = store.getState().project!;
  const event = resolveVideoProjectActionOccurrences(before)[0]!;
  for (const patch of [
    { clipId: 'foreign', time: 2 },
    { clipId: clip.id, time: NaN },
    { clipId: clip.id, point: { x: 2, y: 1 } },
  ]) {
    store.getState().updateActionEventDetails(event.eventId, patch);
    expect(store.getState().project).toBe(before);
  }
  store.getState().setProject({
    ...before,
    utilityLanes: {
      ...getVideoProjectUtilityLanes(before),
      actions: { visible: true, locked: true },
    },
  });
  const locked = store.getState().project;
  store.getState().updateActionEventDetails(event.eventId, { clipId: clip.id, time: 2 });
  expect(store.getState().project).toBe(locked);
});

it('moves retimed source presses at clip rate and keeps repeated projection single-valued', () => {
  const { store, clip } = fixture(true);
  const initial = store.getState().project!;
  const document = initial.sourceInteractionDocuments![0]!;
  store.getState().setProject(
    applyVideoProjectMutationPatch(initial, {
      clips: initial.clips.map((item) =>
        item.id === clip.id ? { ...item, playbackRate: 2, duration: 4 } : item
      ),
      sourceInteractionDocuments: [
        {
          ...document,
          timeline: {
            ...document.timeline,
            overrides: [
              { ref: { kind: 'action', id: 'manual-click' }, start: 4, end: 4.1, enabled: true },
            ],
          },
        },
      ],
    })
  );
  const before = store.getState().project!;
  const row = resolveVideoProjectActionPresentations(before).find(
    (row) => row.occurrence.event.kind === 'CLICK'
  )!;
  store.getState().updateActionEventDetails(row.occurrence.eventId, {
    clipId: clip.id,
    time: row.animationStart + 0.25,
  });
  const next = store.getState().project!;
  expect(
    resolveVideoProjectActionPresentations(next).find(
      (item) => item.occurrence.eventId === row.occurrence.eventId
    )?.animationStart
  ).toBeCloseTo(row.animationStart + 0.25, 8);
  expect(next.sourceInteractionDocuments![0]!.timeline.overrides[0]!.start).toBeCloseTo(4.5, 8);
  expect(
    resolveVideoProjectActionOccurrences(next, [row.occurrence.event]).filter(
      (item) => item.eventId === row.occurrence.eventId
    )
  ).toHaveLength(1);
  store.getState().updateActionEventDetails(row.occurrence.eventId, {
    clipId: clip.id,
    presentation: { enabled: false },
  });
  store
    .getState()
    .updateActionEventDetails(row.occurrence.eventId, { clipId: clip.id, presentation: null });
  expect(
    resolveVideoProjectActionPresentations(store.getState().project!).find(
      (item) => item.occurrence.eventId === row.occurrence.eventId
    )?.reason
  ).not.toBe('event-disabled');
});

it.each([false, true])(
  'Native Delete hides transferred styled mouse feedback through reopen and Undo (generic=%s)',
  (generic) => {
    const { store, clip } = fixture(generic);
    const base = store.getState().project!;
    const click = resolveVideoProjectActionOccurrences(base).find(
      (row) => row.event.kind === 'CLICK'
    )!;
    store.getState().setProject(
      patchSourceInteractionFeedback(base, click.eventId, {
        gestureStyles: patchReviewClicks([], ['manual-click'], { effect: 'magnify' }),
      })
    );
    const before = store.getState().project!;
    const frames = (project: typeof before) =>
      resolveVideoCompositionActions(project, 3.05).filter(
        (state) => state.gestureFeedback?.effect === 'magnify'
      );
    expect(frames(before).length).toBeGreaterThan(0);
    store.getState().updateActionEventDetails(click.eventId, {
      clipId: clip.id,
      presentation: { enabled: false },
    });
    const disabled = store.getState().project!;
    expect(frames(disabled)).toEqual([]);
    const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(disabled)))!;
    expect(reopened).not.toBeNull();
    expect(frames(reopened)).toEqual([]);
    const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, disabled);
    expect(undo?.status).toBe('applied');
    if (undo?.status === 'applied') expect(frames(undo.project).length).toBeGreaterThan(0);
    expect(disabled.actionEvents).toEqual(before.actionEvents);
  }
);
