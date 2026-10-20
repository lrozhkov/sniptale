import { REVIEW_CLICK_DEFAULT } from '../../../../../features/video/project/action-feedback/validation';
import { ReviewActionAudioUnavailable } from '../../../../../features/video/review/action-audio';
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
it('accepts preset and None once while keeping source facts immutable', () => {
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
    const choose = (key: string) =>
      act(() => {
        [...container.querySelectorAll<HTMLButtonElement>('button')]
          .find((button) => button.textContent === key)!
          .click();
      });
    choose('gallery.videoReview.actionAudioMousePaired');
    expect(updateProject).toHaveBeenCalledOnce();
    project = updateProject.mock.calls[0]![0](project);
    expect(project.actionFeedback![0]!.settings[0]).toMatchObject({
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
    });
    expect(project.version).toBe(3);
    render();
    choose('gallery.videoReview.actionAudioNone');
    expect(updateProject).toHaveBeenCalledTimes(2);
    project = updateProject.mock.calls[1]![0](project);
    expect(project.actionFeedback![0]!.settings[0]!.enabled).toBe(false);
    expect(project.actionEvents).toEqual(original);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('separates visual gesture parameters from sound without changing their source-scoped update', () => {
  updateProject.mockClear();
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'drag',
        kind: 'CLICK',
        time: 1,
        duration: 1,
        point: { x: 0.2, y: 0.3 },
        label: '',
        preset: 'NONE',
        data: {
          gestureType: 'drag',
          gestureId: 'drag',
          button: 0,
          downTime: 1,
          upTime: 2,
          completion: 'released',
        },
      },
    ],
  });
  const facts = structuredClone(project.actionEvents);
  const host = document.createElement('div');
  const root = createRoot(host);
  const props = {
    project,
    recordingId: 'rec',
    sourceInstanceId: project.actionFeedback![0]!.sourceInstanceId,
    target: { ref: { kind: 'action' as const, id: 'drag' }, family: 'mouse' as const },
    disabled: false,
    gesture: true,
  };
  try {
    act(() => root.render(<ActionFeedbackFields {...props} part="sound" />));
    expect(host.querySelector('[data-ui="video-editor.action-audio-fields"]')).not.toBeNull();
    expect(host.textContent).not.toContain('gallery.videoReview.gestureAppearance');
    act(() => root.render(<ActionFeedbackFields {...props} part="gesture" />));
    expect(host.querySelector('[data-ui="video-editor.action-audio-fields"]')).toBeNull();
    const toggle = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.gestureFeedback"]'
    )!;
    expect(toggle).not.toBeNull();
    act(() => toggle.click());
    expect(updateProject).toHaveBeenCalledOnce();
    const changed = updateProject.mock.lastCall![0](project);
    expect(changed.actionFeedback![0]!.gestureStyles![0]).toMatchObject({
      id: 'drag',
      effect: 'off',
    });
    expect(changed.actionFeedback![0]!.settings).toEqual(project.actionFeedback![0]!.settings);
    expect(changed.actionEvents).toEqual(facts);
  } finally {
    act(() => root.unmount());
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
      act(() =>
        host.querySelector<HTMLButtonElement | HTMLInputElement>(`[aria-label="${label}"]`)!.click()
      );
    const accept = () => {
      project = updateProject.mock.lastCall![0](project);
      render();
    };
    try {
      render();
      if (family === 'mouse') {
        act(() =>
          [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
            .find((option) => option.textContent === 'gallery.videoReview.gesture_area')!
            .click()
        );
        accept();
        expect(project.actionFeedback![0]!.gestureStyles![0]!.effect).toBe('press');
      }
      act(() => {
        const label =
          family === 'mouse'
            ? 'gallery.videoReview.actionAudioMousePaired'
            : 'gallery.videoReview.actionAudioRecorded';
        [...host.querySelectorAll<HTMLButtonElement>('button')]
          .find((button) => button.textContent === label)!
          .click();
      });
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
        act(() =>
          [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
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

function feedbackFixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'sound',
        kind: 'CLICK',
        time: 1,
        duration: 0.3,
        point: { x: 0.2, y: 0.3 },
        label: '',
        preset: 'NONE',
        data: {
          gestureId: 'sound',
          gestureType: 'hold',
          downTime: 1,
          upTime: 1.3,
          button: 0,
          completion: 'released',
          downX: 32,
          downY: 27,
          upX: 32,
          upY: 27,
          maxExcursionCssPx: 0,
          pressDuration: 0.3,
        },
      },
      {
        id: 'other',
        kind: 'KEY',
        time: 2,
        duration: 0.1,
        point: null,
        label: 'Other key',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  project.actionFeedback![0]!.settings = [
    {
      ref: { kind: 'action', id: 'sound' },
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
      volume: 0.5,
      offset: 0,
    },
    {
      ref: { kind: 'action', id: 'other' },
      enabled: true,
      presetId: 'keyboard-v1',
      volume: 0.4,
      offset: 0.1,
    },
  ];
  return project;
}

it('uses the full shared mouse catalog and resets only the selected sound setting', () => {
  updateProject.mockClear();
  let project = feedbackFixture();
  const group = project.actionFeedback![0]!;
  const before = structuredClone(project);
  const host = document.createElement('div'),
    root = createRoot(host);
  const render = () =>
    act(() =>
      root.render(
        <ActionFeedbackFields
          project={project}
          recordingId="rec"
          sourceInstanceId={group.sourceInstanceId}
          target={{ ref: { kind: 'action', id: 'sound' }, family: 'mouse', recorded: true }}
          disabled={false}
        />
      )
    );
  const choose = (label: string) =>
    act(() => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === label)!
        .click();
    });
  try {
    render();
    expect(host.textContent).toContain('gallery.videoReview.actionAudioMouseAlternate');
    expect(host.textContent).toContain('gallery.videoReview.actionAudioMouseSoft');
    choose('gallery.videoReview.actionAudioMouseAlternate');
    project = updateProject.mock.lastCall![0]({ ...project, name: 'Concurrent rename' });
    render();
    expect(project.name).toBe('Concurrent rename');
    expect(
      project.actionFeedback![0]!.settings.find((item) => item.ref.id === 'sound')?.presetId
    ).toBe('mouse-alternate-v1');
    expect(host.querySelector('[aria-label="gallery.videoReview.actionAudioDown"]')).toBeNull();
    choose('gallery.videoReview.actionAudioReset');
    project = updateProject.mock.lastCall![0](project);
    expect(project.actionFeedback![0]!.settings).toEqual([before.actionFeedback![0]!.settings[1]]);
    expect(project.actionEvents).toEqual(before.actionEvents);
    expect(project.clips).toEqual(before.clips);
    expect(project.actionFeedback![0]!.signals).toEqual(before.actionFeedback![0]!.signals);
  } finally {
    act(() => root.unmount());
  }
});

it('cancels stale audition and exposes retry without document writes or playhead changes', async () => {
  updateProject.mockClear();
  setPlaying.mockClear();
  closeAudition.mockClear();
  auditionWork.mockReset();
  let rejectLate!: (reason: Error) => void;
  auditionWork.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectLate = reject;
      })
  );
  let project = feedbackFixture();
  getAuthoredProject.mockImplementation(() => project);
  const host = document.createElement('div'),
    root = createRoot(host);
  const render = () =>
    act(() =>
      root.render(
        <ActionFeedbackFields
          project={{ ...project }}
          recordingId="rec"
          sourceInstanceId={project.actionFeedback![0]!.sourceInstanceId}
          target={{ ref: { kind: 'action', id: 'sound' }, family: 'mouse', recorded: true }}
          disabled={false}
        />
      )
    );
  const listen = () =>
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.actionAudioListen"]')!;
  try {
    render();
    act(() => listen().click());
    const first = auditionWork.mock.calls[0]![1];
    expect(first.aborted).toBe(false);
    render();
    expect(first.aborted).toBe(false);
    expect(setPlaying).toHaveBeenCalledWith(false);
    project = { ...project, updatedAt: project.updatedAt + 1 };
    render();
    expect(first.aborted).toBe(false);
    const authored = structuredClone(project);
    project = { ...structuredClone(project), name: 'Replaced same ID' };
    render();
    expect(first.aborted).toBe(true);
    await act(async () => {
      rejectLate(new Error('Late private detail'));
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    auditionWork.mockRejectedValueOnce(new Error('Resource detail'));
    await act(async () => {
      listen().click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'gallery.videoReview.actionAudioResource'
    );
    expect(host.textContent).not.toContain('Resource detail');
    auditionWork.mockRejectedValueOnce(new ReviewActionAudioUnavailable('voice-limit'));
    await act(async () => {
      listen().click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'gallery.videoReview.actionAudioLimit'
    );

    auditionWork.mockResolvedValueOnce();
    await act(async () => {
      listen().click();
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    auditionWork.mockImplementationOnce(() => new Promise<void>(() => undefined));
    act(() => listen().click());
    const last = auditionWork.mock.lastCall![1];
    act(() => root.unmount());
    expect(last.aborted).toBe(true);
    expect(updateProject).not.toHaveBeenCalled();
    expect(project).toEqual({ ...authored, name: 'Replaced same ID' });
  } finally {
    if (host.firstChild) act(() => root.unmount());
  }
});

it('preserves the current inherited gesture appearance on the first shape edit', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  updateProject.mockClear();
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    hasAudio: false,
    sourceNormalizedActionEvents: [
      {
        id: 'hold',
        kind: 'CLICK',
        time: 1,
        duration: 1,
        point: { x: 0.5, y: 0.5 },
        label: '',
        preset: 'NONE',
        data: {
          gestureId: 'hold',
          gestureType: 'hold',
          button: 0,
          downTime: 1,
          upTime: 2,
          downX: 80,
          downY: 45,
          upX: 80,
          upY: 45,
          maxExcursionCssPx: 0,
          pressDuration: 1,
          completion: 'released',
        },
      },
    ],
  });
  project.actionPresentation = {
    enabled: true,
    clickPreset: 'CLICK_RIPPLE',
    duration: 0.7,
    offset: 0,
    clickSuppressionInterval: 1,
    showKeystrokes: false,
    clickStyle: { color: '#ff0000ff', size: 70, strokeWidth: 4, opacity: 0.5 },
  };
  const group = project.actionFeedback![0]!;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ActionFeedbackFields
          project={project}
          recordingId="rec"
          sourceInstanceId={group.sourceInstanceId}
          target={{ ref: { kind: 'action', id: 'hold' }, family: 'mouse' }}
          disabled={false}
          gesture
          part="gesture"
        />
      )
    );
    const shape = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'gallery.videoReview.gesture_path'
    )!;
    expect(shape).toBeDefined();
    act(() => shape.click());
    expect(updateProject).toHaveBeenCalledOnce();
    const current = structuredClone(project);
    current.name = 'Concurrent rename';
    current.actionPresentation!.clickStyle = {
      color: '#cc2200ff',
      size: 90,
      strokeWidth: 5,
      opacity: 0.8,
    };
    const changed = updateProject.mock.lastCall![0](current);
    expect(changed.actionFeedback![0]!.gestureStyles![0]).toMatchObject({
      id: 'hold',
      effect: 'press',
      gestureAppearance: 'path',
      color: '#cc2200ff',
      radius: 90,
      stroke: 5,
      opacity: 0.8,
    });
    expect(changed.name).toBe('Concurrent rename');
    expect(changed.actionEvents).toEqual(current.actionEvents);
    expect(changed.clips).toEqual(current.clips);
    expect(changed.actionFeedback![0]!.settings).toEqual(current.actionFeedback![0]!.settings);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('resets only the selected authored gesture and keeps source, sound and other instances', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  updateProject.mockClear();
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'hold',
        kind: 'CLICK',
        time: 1,
        duration: 1,
        point: { x: 0.5, y: 0.5 },
        label: '',
        preset: 'NONE',
        data: {
          gestureType: 'hold',
          gestureId: 'hold',
          downTime: 1,
          upTime: 2,
          completion: 'released',
        },
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  group.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'hold', effect: 'press', radius: 75 },
    { ...REVIEW_CLICK_DEFAULT, id: 'other', effect: 'off', radius: 40 },
  ];
  group.settings = [
    {
      ref: { kind: 'action', id: 'hold' },
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
      volume: 0.6,
      offset: 0.1,
    },
  ];
  project.actionFeedback!.push({ ...structuredClone(group), sourceInstanceId: 'other-instance' });
  const original = structuredClone(project);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <ActionFeedbackFields
          project={project}
          recordingId="rec"
          sourceInstanceId={group.sourceInstanceId}
          target={{ ref: { kind: 'action', id: 'hold' }, family: 'mouse' }}
          disabled={false}
          gesture
          part="gesture"
        />
      )
    );
    const reset = host.querySelector<HTMLButtonElement>('[data-ui="video-editor.gesture.reset"]')!;
    expect(reset.disabled).toBe(false);
    expect(reset.querySelector('svg')).not.toBeNull();
    act(() => reset.click());
    const updater = updateProject.mock.lastCall![0];
    const changed = updater(project);
    expect(changed.actionFeedback![0]!.gestureStyles).toEqual([
      original.actionFeedback![0]!.gestureStyles![1],
    ]);
    expect(changed.actionFeedback![0]!.settings).toEqual(original.actionFeedback![0]!.settings);
    expect(changed.actionFeedback![1]).toEqual(original.actionFeedback![1]);
    expect(changed.actionEvents).toEqual(original.actionEvents);
    expect(changed.clips).toEqual(original.clips);
    expect(changed.assets).toEqual(original.assets);
    expect(updater(changed)).toBe(changed);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
