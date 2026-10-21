// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { translate } from '../../../../../platform/i18n';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { useVideoEditorStore } from '../../../../state/store';
import { ProjectSourceAudioEditor } from './source-audio';

let original: ReturnType<typeof useVideoEditorStore.getState>;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  original = useVideoEditorStore.getState();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(original, true);
  vi.unstubAllGlobals();
});
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source with a long name.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source clip');
  return { project, clip };
}
function mount(
  project: ReturnType<typeof fixture>['project'],
  source?: { kind: 'source'; assetId: string; sourceInstanceId: string }
) {
  useVideoEditorStore.getState().setProject(project);
  function Harness() {
    const current = useVideoEditorStore((state) => state.project)!;
    return (
      <InspectorLayout>
        <ProjectSourceAudioEditor project={current} {...(source ? { source } : {})} />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness />));
}
function addGain() {
  const name = [
    translate('videoEditor.sidebar.sourceAudioAdd'),
    translate('videoEditor.sidebar.sourceAudioGain'),
  ].join(': ');
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  act(() => button.click());
}
function input(label: Parameters<typeof translate>[0]) {
  const element = host.querySelector<HTMLInputElement>(`input[aria-label="${translate(label)}"]`);
  if (!element) throw new Error(`Missing input ${label}`);
  return element;
}
function commit(element: HTMLInputElement, value: string) {
  act(() => element.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
}

it('adds source-clock ranges through the real history port and removes the last range atomically', async () => {
  const { project } = fixture();
  project.clips.find((clip) => clip.type === 'AUDIO')!.name = 'Montage source';
  mount(project);
  expect(host.textContent).toContain('Montage source');
  addGain();
  const current = useVideoEditorStore.getState().project!;
  expect(current.sourceAudioDocuments?.[0]?.ranges).toMatchObject([
    { start: 0, end: 10, volume: 1 },
  ]);
  expect(current.version).toBe(28);
  commit(input('videoEditor.sidebar.sourceAudioStart'), '0.123456');
  expect(useVideoEditorStore.getState().project!.sourceAudioDocuments?.[0]?.ranges[0]?.start).toBe(
    0.123456
  );
  const remove = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === translate('videoEditor.sidebar.sourceAudioRemove')
  )!;
  act(() => remove.focus());
  act(() => remove.click());
  await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(document.activeElement).toBe(host.querySelector('[data-source-audio-add]'));
  expect(useVideoEditorStore.getState().project!.sourceAudioDocuments).toEqual([]);
  expect(project.sourceAudioDocuments).toBeUndefined();
});

it('preserves accepted off-step times on focus and blur without a history mutation', () => {
  const { project, clip } = fixture();
  project.version = 28;
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: {
        kind: 'source',
        assetId: clip.assetId,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      },
      ranges: [{ id: 'gain', start: 0.123456789, end: 8, volume: 1.123456789 }],
      mutes: [],
    },
  ];
  mount(project, {
    kind: 'source',
    assetId: clip.assetId,
    sourceInstanceId: clip.sourceInstanceId ?? clip.id,
  });
  const before = useVideoEditorStore.getState().project!;
  const start = input('videoEditor.sidebar.sourceAudioStart');
  act(() => start.focus());
  act(() => start.blur());
  expect(useVideoEditorStore.getState().project).toBe(before);
  expect(before.sourceAudioDocuments![0]!.ranges[0]!.start).toBe(0.123456789);
});

it('keeps dormant source documents editable and disables locked source controls', () => {
  const { project, clip } = fixture();
  project.version = 28;
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: {
        kind: 'source',
        assetId: clip.assetId,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      },
      ranges: [{ id: 'gain', start: 1, end: 2, volume: 2 }],
      mutes: [],
    },
  ];
  project.clips = [];
  mount(project);
  expect(input('videoEditor.sidebar.sourceAudioStart').disabled).toBe(false);
  act(() =>
    useVideoEditorStore.getState().setProject({
      ...project,
      clips: [clip],
      tracks: project.tracks.map((track) => ({ ...track, locked: true })),
    })
  );
  expect(input('videoEditor.sidebar.sourceAudioStart').disabled).toBe(true);
});

it.each([null, 0.0005])(
  'disables new ranges for source duration %s while retaining editable existing data',
  (duration) => {
    const { project, clip } = fixture();
    project.version = 28;
    project.clips = [];
    project.assets[0]!.metadata.duration = duration;
    project.sourceAudioDocuments = [
      {
        id: 'envelope',
        binding: {
          kind: 'source',
          assetId: clip.assetId,
          sourceInstanceId: clip.sourceInstanceId ?? clip.id,
        },
        ranges: [],
        mutes: [],
      },
    ];
    mount(project);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[title]')].filter(
      (button) => button.title === translate('videoEditor.sidebar.sourceAudioAdd')
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    if (duration === null) {
      act(() =>
        useVideoEditorStore.getState().setProject({
          ...project,
          sourceAudioDocuments: [
            {
              ...project.sourceAudioDocuments![0]!,
              ranges: [{ id: 'gain', start: 0, end: 1, volume: 2 }],
            },
          ],
        })
      );
      expect(input('videoEditor.sidebar.sourceAudioStart').disabled).toBe(false);
    }
  }
);

it('retries the same refused start after editing the dependent end bound', () => {
  const { project, clip } = fixture();
  project.version = 28;
  const source = {
    kind: 'source' as const,
    assetId: clip.assetId,
    sourceInstanceId: clip.sourceInstanceId ?? clip.id,
  };
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: source,
      ranges: [{ id: 'gain', start: 1, end: 3, volume: 1 }],
      mutes: [],
    },
  ];
  mount(project, source);
  commit(input('videoEditor.sidebar.sourceAudioStart'), '4');
  expect(useVideoEditorStore.getState().project!.sourceAudioDocuments?.[0]?.ranges[0]?.start).toBe(
    1
  );
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  commit(input('videoEditor.sidebar.sourceAudioEnd'), '6');
  expect(input('videoEditor.sidebar.sourceAudioStart').value).toBe('1');
  commit(input('videoEditor.sidebar.sourceAudioStart'), '4');
  expect(
    useVideoEditorStore.getState().project!.sourceAudioDocuments?.[0]?.ranges[0]
  ).toMatchObject({ start: 4, end: 6 });
});

it('isolates refused drafts and errors when another insertion reuses the same range IDs', () => {
  const { project, clip } = fixture();
  const first = {
    kind: 'source' as const,
    assetId: clip.assetId,
    sourceInstanceId: clip.sourceInstanceId ?? clip.id,
  };
  const second = { ...first, sourceInstanceId: 'copy' };
  project.version = 28;
  project.sourceAudioDocuments = [first, second].map((binding, index) => ({
    id: String(index),
    binding,
    ranges: [{ id: 'same-range-id', start: 1, end: 3, volume: 1 }],
    mutes: [],
  }));
  useVideoEditorStore.getState().setProject(project);
  function Harness({ source }: { source: typeof first }) {
    const current = useVideoEditorStore((state) => state.project)!;
    return (
      <InspectorLayout>
        <ProjectSourceAudioEditor project={current} source={source} />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness source={first} />));
  commit(input('videoEditor.sidebar.sourceAudioStart'), '4');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  act(() => root.render(<Harness source={second} />));
  expect(input('videoEditor.sidebar.sourceAudioStart').value).toBe('1');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(useVideoEditorStore.getState().project!.sourceAudioDocuments?.[0]?.ranges[0]?.start).toBe(
    1
  );
});

it('allows another static attenuation range when the existing range covers the source', () => {
  const { project } = fixture();
  mount(project);
  const name = [
    translate('videoEditor.sidebar.sourceAudioAdd'),
    translate('videoEditor.sidebar.sourceAudioAttenuation'),
  ].join(': ');
  const add = () => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  act(() => add().click());
  expect(add().disabled).toBe(false);
  act(() => add().click());
  const current = useVideoEditorStore.getState().project!;
  expect(current.sourceAudioDocuments?.[0]?.mutes).toHaveLength(2);
  expect(
    current.sourceAudioDocuments?.[0]?.mutes.map(({ start, end, volume }) => ({
      start,
      end,
      volume,
    }))
  ).toEqual([
    { start: 0, end: 10, volume: 0.25 },
    { start: 0, end: 10, volume: 0.25 },
  ]);
  expect(current.sourceAudioDocuments?.[0]?.ranges).toEqual([]);
});
