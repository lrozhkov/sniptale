import { expect, it } from 'vitest';

it('keeps authored source path and audible feedback attached to duplicated recording identities', async () => {
  const { createVideoProjectFromRecording } =
    await import('../../../../features/video/project/factories/creation');
  const { buildProjectActionAudioPlan, evaluateProjectGestureFeedback } =
    await import('../../../../features/video/review/project-action-audio');
  const { patchReviewKeys } =
    await import('../../../../features/video/project/action-feedback/key-animation');
  const { resolveVideoCompositionActions } =
    await import('../../../../features/video/composition/timeline/frame/actions');
  const { parseHydratableVideoProject } =
    await import('../../../../features/video/project/validation/root');
  const { transformPortableVideoProjectReferences } = await import('./video-project-references');
  const { resolveProjectCursorFocusSamples } =
    await import('../../../../features/video/project/cursor-focus-path/projection');
  const project = createVideoProjectFromRecording({
    recordingId: 'old',
    filename: 'old.webm',
    width: 1280,
    height: 720,
    duration: 4,
    mimeType: 'video/webm',
    size: 1024,
    recordingSignals: [],
    sourceNormalizedActionEvents: [
      {
        id: 'command',
        kind: 'KEY',
        time: 1,
        duration: 0.3,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: {},
      },
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.45,
        point: { x: 0.2, y: 0.3 },
        label: 'Click',
        preset: 'CLICK_RIPPLE',
        data: {},
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  group.settings = [
    {
      ref: { kind: 'action', id: 'click' },
      enabled: true,
      presetId: 'mouse-classic-v1',
      volume: 0.35,
      offset: 0,
    },
  ];
  project.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'segment',
        binding: {
          kind: 'recording-source',
          recordingId: 'old',
          sourceInstanceId: group.sourceInstanceId,
        },
        start: 0,
        end: 4,
        keys: [{ id: 'key', time: 1, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'smooth' }],
      },
    ],
  };
  group.gestureStyles = [
    {
      id: 'click',
      effect: 'magnify',
      color: '#123456cc',
      radius: 40,
      stroke: 4,
      opacity: 0.75,
      before: 0.3,
      after: 0.9,
      offset: -0.15,
      x: 0.2,
      y: -0.1,
      pulses: 3,
      easing: 'ease-in-out',
      magnification: 2.4,
      lensShape: 'rounded',
      lensShadow: 36,
    },
  ];
  group.keyStyles = patchReviewKeys([], ['command'], {
    enabled: true,
    before: 0.2,
    after: 2,
    offset: -0.1,
    style: {
      fontFamily: 'monospace',
      fontSize: 36,
      color: '#12345680',
      background: '#abcdef90',
      opacity: 0.7,
      cornerRadius: 12,
      margin: 42,
      entrance: 'slide',
      position: 'top-right',
    },
  });
  const original = structuredClone(project);
  const restored = transformPortableVideoProjectReferences(
    project,
    new Map(),
    { 'media:library-item:recording:old': 'recording:new' },
    {}
  );
  expect(buildProjectActionAudioPlan(original).descriptors).toHaveLength(1);
  expect(buildProjectActionAudioPlan(restored).descriptors).toHaveLength(1);
  expect(restored.actionFeedback?.[0]?.recordingId).toBe('new');
  expect(parseHydratableVideoProject(restored)).not.toBeNull();
  expect(restored.actionFeedback?.[0]?.keyStyles).toEqual(original.actionFeedback![0]!.keyStyles);
  const originalCaption = resolveVideoCompositionActions(original, 1.1).find(
    (action) => action.renderKind === 'keystroke'
  );
  const restoredCaption = resolveVideoCompositionActions(restored, 1.1).find(
    (action) => action.renderKind === 'keystroke'
  );
  expect(originalCaption).toBeDefined();
  expect(restoredCaption).toMatchObject({
    keyStyle: originalCaption!.keyStyle,
    duration: originalCaption!.duration,
    progress: originalCaption!.progress,
    clipId: null,
    event: { label: 'Ctrl+K', anchor: { recordingId: 'new', sourceEventId: 'command' } },
  });
  expect(restored.actionFeedback?.[0]?.gestureStyles).toEqual(
    original.actionFeedback![0]!.gestureStyles
  );
  expect(evaluateProjectGestureFeedback(restored, 1.1)).toEqual(
    evaluateProjectGestureFeedback(original, 1.1)
  );
  expect(resolveProjectCursorFocusSamples(restored)[0]?.sourceAnchor?.recordingId).toBe('new');
  expect(project).toEqual(original);
  expect(() => transformPortableVideoProjectReferences(project, new Map(), {}, {})).toThrow(
    'unresolved'
  );
});
