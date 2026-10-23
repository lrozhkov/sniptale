import { REVIEW_CLICK_DEFAULT } from '../../../../../features/video/project/action-feedback/validation';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { VideoProject } from '../../../../../features/video/project/types';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { ActionFeedbackFields } from './action-feedback-fields';
const { updateProject, setPlaying, auditionWork, closeAudition, getAuthoredProject } = vi.hoisted(
  () => ({
    getAuthoredProject: vi.fn<() => VideoProject | null>(() => null),
    auditionWork: vi.fn<(plan: unknown, signal: AbortSignal) => Promise<void>>(),
    closeAudition: vi.fn(async () => undefined),
    setPlaying: vi.fn(),
    updateProject: vi.fn<(updater: (project: VideoProject) => VideoProject) => void>(),
  })
);
vi.mock('../../../../runtime/controller/store', () => ({
  useVideoEditorProjectLifecyclePort: (
    selector: (port: { project: VideoProject | null }) => unknown
  ) => selector({ project: getAuthoredProject() }),
  useVideoEditorPlaybackPort: (selector: (port: { setPlaying: typeof setPlaying }) => unknown) =>
    selector({ setPlaying }),
  useVideoEditorTimelineEditingPort: (
    selector: (port: { updateProject: typeof updateProject }) => unknown
  ) => selector({ updateProject }),
}));
vi.mock('../../../../preview/stage/runtime/action-audio', () => ({
  createProjectActionAudioRuntime: () => ({ audition: auditionWork, close: closeAudition }),
}));
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
it('uses the Gallery off default for ordinary source clicks and preserves current unrelated edits', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'click-source',
    filename: 'click.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.1,
        point: { x: 0.5, y: 0.5 },
        label: '',
        data: {},
        preset: 'NONE',
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ActionFeedbackFields
          project={project}
          recordingId={group.recordingId}
          sourceInstanceId={group.sourceInstanceId}
          target={{ ref: { kind: 'action', id: 'click' }, family: 'mouse' }}
          disabled={false}
          visual="click"
          part="visual"
        />
      )
    );
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe(
      'gallery.videoReview.click_off'
    );
    updateProject.mockClear();
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
        .find((item) => item.textContent === 'gallery.videoReview.click_ripple')!
        .click()
    );
    const current: VideoProject = {
      ...project,
      name: 'Concurrent title',
      actionFeedback: [
        {
          ...group,
          settings: [
            {
              ref: { kind: 'action' as const, id: 'other' },
              enabled: true,
              presetId: 'mouse-classic-paired-v2',
              volume: 0.2,
              offset: 0,
            },
          ],
        },
      ],
    };
    const changed = updateProject.mock.calls[0]![0](current);
    expect(changed.name).toBe('Concurrent title');
    expect(changed.actionFeedback![0]!.settings).toEqual(current.actionFeedback![0]!.settings);
    expect(changed.actionFeedback![0]!.gestureStyles![0]).toEqual({
      ...REVIEW_CLICK_DEFAULT,
      id: 'click',
      effect: 'ripple',
    });
    expect(changed.actionEvents).toEqual(project.actionEvents);
    expect(
      updateProject.mock.calls[0]![0]({ ...current, actionFeedback: [] }).actionFeedback
    ).toEqual([]);
    const deleted = { ...current, actionEvents: [] };
    expect(updateProject.mock.calls[0]![0](deleted)).toBe(deleted);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
