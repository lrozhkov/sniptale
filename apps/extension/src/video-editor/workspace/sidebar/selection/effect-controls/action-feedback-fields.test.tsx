// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { VideoProject } from '../../../../../features/video/project/types';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { ActionFeedbackFields } from './action-feedback-fields';
const { updateProject } = vi.hoisted(() => ({
  updateProject: vi.fn<(updater: (project: VideoProject) => VideoProject) => void>(),
}));
vi.mock('../../../../runtime/controller/store', () => ({
  useVideoEditorTimelineEditingPort: (
    selector: (port: { updateProject: typeof updateProject }) => unknown
  ) => selector({ updateProject }),
}));
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
it('saves explicit sound enable and disable as one project update while keeping source facts immutable', () => {
  let project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.6,
        point: { x: 0.2, y: 0.3 },
        label: '',
        data: {
          gestureType: 'click',
          gestureId: 'click',
          button: 0,
          downTime: 1,
          upTime: 1.05,
          completion: 'released',
        },
        preset: 'NONE',
      },
    ],
  });
  const original = structuredClone(project.actionEvents);
  const group = project.actionFeedback![0]!;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    act(() =>
      root.render(
        <ActionFeedbackFields
          project={project}
          recordingId="rec"
          sourceInstanceId={group.sourceInstanceId}
          target={{ ref: { kind: 'action', id: 'click' }, family: 'mouse', recorded: true }}
          disabled={false}
        />
      )
    );
  try {
    render();
    const toggle = () =>
      container.querySelector<HTMLButtonElement>(
        '[aria-label="gallery.videoReview.actionAudioEnabled"]'
      )!;
    act(() => toggle().click());
    expect(updateProject).toHaveBeenCalledOnce();
    project = updateProject.mock.calls[0]![0](project);
    expect(project.actionFeedback![0]!.settings[0]).toMatchObject({
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
    });
    expect(project.version).toBe(3);
    render();
    act(() => toggle().click());
    expect(updateProject).toHaveBeenCalledTimes(2);
    project = updateProject.mock.calls[1]![0](project);
    expect(project.actionFeedback![0]!.settings[0]!.enabled).toBe(false);
    expect(project.actionEvents).toEqual(original);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
it.each(['mouse', 'keyboard', 'typing'] as const)(
  'feedback inspector preserves source facts for %s controls',
  async (family) => {
    updateProject.mockClear();
    let project = createVideoProjectFromRecording({
      recordingId: 'rec',
      filename: 'rec.webm',
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/webm',
      size: 1024,
      recordingSignals: [
        { id: 'typing', kind: 'typing', startTime: 1, endTime: 2, point: null, data: {} },
      ],
      sourceNormalizedActionEvents: [
        {
          id: 'event',
          kind: family === 'mouse' ? 'CLICK' : 'KEY',
          time: 1,
          duration: 0.6,
          point: { x: 0.2, y: 0.3 },
          label: '',
          data: {
            gestureType: 'drag',
            gestureId: 'event',
            downTime: 1,
            upTime: 2,
            completion: 'released',
            button: 0,
          },
          preset: 'NONE',
        },
      ],
    });
    const group = project.actionFeedback![0]!,
      original = structuredClone(project.actionEvents);
    const target = {
      ref:
        family === 'typing'
          ? { kind: 'signal' as const, id: 'typing' }
          : { kind: 'action' as const, id: 'event' },
      family,
      recorded: true,
    };
    const host = document.createElement('div'),
      root = createRoot(host);
    document.body.append(host);
    const render = () =>
      act(() =>
        root.render(
          <ActionFeedbackFields
            project={project}
            recordingId="rec"
            sourceInstanceId={group.sourceInstanceId}
            target={target}
            disabled={false}
            gesture={family === 'mouse'}
          />
        )
      );
    const click = (label: string) =>
      act(() => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
    const accept = () => {
      project = updateProject.mock.lastCall![0](project);
      render();
    };
    try {
      render();
      if (family === 'mouse') {
        click('gallery.videoReview.gestureAppearance');
        await act(async () =>
          [...document.querySelectorAll<HTMLElement>('[role="option"]')]
            .find((option) => option.textContent === 'gallery.videoReview.gesture_area')!
            .click()
        );
        accept();
        expect(project.actionFeedback![0]!.gestureStyles![0]!.effect).toBe('press');
      }
      click('gallery.videoReview.actionAudioEnabled');
      accept();
      expect(project.actionFeedback![0]!.settings[0]!.presetId).toBe(
        family === 'mouse'
          ? 'mouse-classic-paired-v2'
          : family === 'keyboard'
            ? 'keyboard-recorded-v2'
            : 'typing-recorded-v2'
      );
      if (family === 'mouse') {
        click('gallery.videoReview.actionAudioDown');
        accept();
        expect(project.actionFeedback![0]!.settings[0]!.downEnabled).toBe(false);
        click('gallery.videoReview.actionAudioUp');
        accept();
        expect(project.actionFeedback![0]!.settings[0]!.upEnabled).toBe(false);
        click('gallery.videoReview.gestureFeedback');
        accept();
        expect(project.actionFeedback![0]!.gestureStyles![0]!.effect).toBe('off');
        click('gallery.videoReview.gestureFeedback');
        accept();
        click('gallery.videoReview.gestureAppearance');
        await act(async () =>
          [...document.querySelectorAll<HTMLElement>('[role="option"]')]
            .find((option) => option.textContent === 'gallery.videoReview.gesture_area')!
            .click()
        );
        accept();
        expect(project.actionFeedback![0]!.gestureStyles![0]!.gestureArea).toEqual({
          x: 0.2,
          y: 0.3,
          width: 0.01,
          height: 0.01,
        });
        const range = host.querySelector<HTMLInputElement>(
          'input[aria-label="gallery.videoReview.gestureArea_x range"]'
        )!;
        expect(range.closest('details')?.open).toBe(false);
        expect(range.max).toBe('99');
        for (const [axis, value] of [
          ['x', '10'],
          ['y', '20'],
          ['width', '30'],
          ['height', '40'],
        ]) {
          const input = host.querySelector<HTMLInputElement>(
            `input[aria-label="gallery.videoReview.gestureArea_${axis}"]`
          )!;
          expect(input).not.toBeNull();
          act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
              input,
              value
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          act(() =>
            input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
          );
          accept();
        }
        expect(project.actionFeedback![0]!.gestureStyles![0]!.gestureArea).toEqual({
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.4,
        });
      } else {
        click('gallery.videoReview.actionAudioRepeats');
        accept();
        expect(project.actionFeedback![0]!.settings[0]!.includeRepeats).toBe(true);
      }
      expect(project.actionEvents).toEqual(original);
      const removed = { ...project, actionFeedback: [] };
      expect(updateProject.mock.lastCall![0](removed)).toBe(removed);
      if (family === 'typing') {
        project.actionFeedback![0]!.signals[0]!.data['privacy'] = 'protected';
        render();
        expect(host.textContent).toBe('');
      }
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  }
);
