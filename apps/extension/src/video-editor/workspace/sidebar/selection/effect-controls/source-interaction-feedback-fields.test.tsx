// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { ReviewKeyPatch } from '../../../../../features/video/project/action-feedback/key-animation';
import type {
  ReviewClickStyle,
  ReviewActionAudioPatch,
} from '../../../../../features/video/project/action-feedback/types';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../../features/video/project/mutation';
import { resolveVideoProjectActionOccurrences } from '../../../../../features/video/project/action-occurrences';
import {
  getVideoProjectClickStyle,
  getVideoProjectKeyStyle,
} from '../../../../../features/video/project/action-feedback/projection';
import { sourceInteractionFeedback } from '../../../../../features/video/project/source-interaction-authoring';
import { parseHydratableVideoProject } from '../../../../../features/video/project/validation/root';
import { SourceInteractionFeedbackFields } from './source-interaction-feedback-fields';
const callbacks = vi.hoisted(() => ({
  key: null as ((patch: ReviewKeyPatch) => void) | null,
  mouse: null as ((patch: Partial<ReviewClickStyle>) => void) | null,
  audio: null as ((targets: readonly unknown[], patch: ReviewActionAudioPatch) => void) | null,
  update: vi.fn<(f: (project: VideoProject) => VideoProject) => void>(),
}));
vi.mock('../../../../runtime/controller/store', () => ({
  useVideoEditorTimelineEditingPort: (
    select: (port: { updateProject: typeof callbacks.update }) => unknown
  ) => select({ updateProject: callbacks.update }),
}));
vi.mock('../../../../../ui/keyboard-feedback/fields', () => ({
  KeyboardFeedbackFields: (props: { onChange: (patch: ReviewKeyPatch) => void }) => {
    callbacks.key = props.onChange;
    return <div />;
  },
}));
vi.mock('../../../../../ui/pointer-feedback/fields', () => ({
  PointerFeedbackFields: (props: { onChange: (patch: Partial<ReviewClickStyle>) => void }) => {
    callbacks.mouse = props.onChange;
    return <div />;
  },
}));
vi.mock('../../../../../ui/action-audio/fields', () => ({
  ActionAudioFields: (props: {
    onChange: (targets: readonly unknown[], patch: ReviewActionAudioPatch) => void;
  }) => {
    callbacks.audio = props.onChange;
    return <div />;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  callbacks.update.mockClear();
});
it.each([false, true])(
  'uses Native source feedback mutations for shared key, mouse and sound fields (generic=%s)',
  (generic) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const seed = createVideoProjectFromRecording({
      recordingId: 'source',
      filename: 'source.webm',
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/webm',
      size: 100,
    });
    const clip = seed.clips[0]!;
    if (clip.type !== 'VIDEO') throw Error('Video fixture required');
    let current = applyVideoProjectMutationPatch(
      generic
        ? {
            ...seed,
            source: { kind: 'manual' },
            baseRecordingId: null,
            assets: seed.assets.map((asset) => ({
              ...asset,
              source: { kind: 'project-asset', projectAssetId: 'bytes' },
            })),
            actionFeedback: [],
          }
        : seed,
      {
        sourceInteractionDocuments: [
          {
            id: 'source-input',
            binding: { assetId: clip.assetId, sourceInstanceId: clip.sourceInstanceId! },
            cursorMotions: [],
            cursorEnabled: false,
            keyboardEnabled: true,
            mouseEnabled: true,
            timeline: {
              presses: [
                {
                  id: 'key',
                  family: 'keyboard',
                  start: 1,
                  end: 1.2,
                  label: 'Cmd+K',
                  button: 0,
                  x: 0.4,
                  y: 0.5,
                },
                {
                  id: 'click',
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
    callbacks.update.mockImplementation((f) => {
      current = f(current);
    });
    const facts = structuredClone(current.actionEvents);
    const host = document.createElement('div'),
      root = createRoot(host);
    document.body.append(host);
    try {
      const key = resolveVideoProjectActionOccurrences(current).find(
        (row) => row.event.kind === 'KEY'
      )!.event;
      act(() =>
        root.render(
          <SourceInteractionFeedbackFields
            project={current}
            event={key}
            part="display"
            disabled={false}
          />
        )
      );
      act(() => callbacks.key!({ enabled: true, style: { color: '#123456' } }));
      expect(getVideoProjectKeyStyle(current, key)).toMatchObject({
        enabled: true,
        style: { color: '#123456' },
      });
      const mouse = resolveVideoProjectActionOccurrences(current).find(
        (row) => row.event.kind === 'CLICK'
      )!.event;
      act(() =>
        root.render(
          <SourceInteractionFeedbackFields
            project={current}
            event={mouse}
            part="appearance"
            disabled={false}
          />
        )
      );
      act(() => callbacks.mouse!({ effect: 'magnify', color: '#654321' }));
      expect(getVideoProjectClickStyle(current, mouse)).toMatchObject({
        effect: 'magnify',
        color: '#654321ff',
      });
      act(() =>
        root.render(
          <SourceInteractionFeedbackFields
            project={current}
            event={mouse}
            part="sound"
            disabled={false}
          />
        )
      );
      act(() => callbacks.audio!([], { enabled: true, volume: 0.4 }));
      expect(sourceInteractionFeedback(current, mouse.id)?.settings[0]).toMatchObject({
        enabled: true,
        volume: 0.4,
      });
      expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(current)))).not.toBeNull();
      const before = current;
      act(() =>
        root.render(
          <SourceInteractionFeedbackFields project={current} event={key} part="display" disabled />
        )
      );
      act(() => callbacks.key!({ enabled: false }));
      expect(current).toBe(before);
      expect(current.actionEvents).toEqual(facts);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  }
);
