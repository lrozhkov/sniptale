// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildReviewTimeMap } from '../../../../../features/video/review/timeline';
import type { VideoProjectSourceVoiceoverDocument } from '../../../../../features/video/project/source-voiceover';
import { InspectSourceVoiceoverPanel, SourceVoiceoverTimingFields } from './source-voiceover';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../../features/video/project/mutation';
import { isExportReadyVideoProject } from '../../../../../features/video/project/validation/root';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { useVideoEditorStore } from '../../../../state/store';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let previousStore: ReturnType<typeof useVideoEditorStore.getState>;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const commit = vi.fn<(take: VideoProjectSourceVoiceoverDocument['take']) => boolean>();
const fixture = (): VideoProjectSourceVoiceoverDocument => ({
  id: 'document',
  trackId: 'track',
  enabled: false,
  binding: { kind: 'source', assetId: 'video', sourceInstanceId: 'instance' },
  reference: buildReviewTimeMap(12, []),
  take: {
    id: 'take',
    assetId: 'audio',
    timelineStart: 3,
    sourceOffset: 2,
    duration: 4,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    sourceAnchor: [{ start: 3, end: 7, offset: 0, duration: 4 }],
  },
});
beforeEach(() => {
  previousStore = useVideoEditorStore.getState();
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  commit.mockReset().mockReturnValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(previousStore, true);
  vi.unstubAllGlobals();
});
function mount(document = fixture(), disabled = false) {
  act(() =>
    root.render(
      <SourceVoiceoverTimingFields
        document={document}
        assetDuration={12}
        disabled={disabled}
        onCommit={commit}
      />
    )
  );
}
function input(field: string) {
  return host.querySelector<HTMLInputElement>(`[data-timing-field="${field}"] input`)!;
}
function edit(field: string, value: string, key = 'Enter') {
  const node = input(field);
  act(() => node.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}
it('uses native file seconds and source position without accepting an Escape draft', () => {
  mount();
  edit('start', '3');
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceOffset: 3, duration: 3, timelineStart: 4 })
  );
  commit.mockClear();
  edit('position', '5', 'Escape');
  act(() => input('position').blur());
  expect(commit).not.toHaveBeenCalled();
  expect(input('position').value).toBe('3');
});
it('restores the durable numeric value and focus on refusal, then accepts a retry', () => {
  mount();
  commit.mockReturnValue(false);
  edit('position', '5');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(input('position').value).toBe('3');
  expect(document.activeElement).toBe(input('position'));
  commit.mockReturnValue(true);
  edit('position', '5');
  expect(commit).toHaveBeenLastCalledWith(expect.objectContaining({ timelineStart: 5 }));
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('places an anchorless dormant take only through the explicit action', () => {
  const doc = fixture();
  doc.take.dormant = true;
  delete doc.take.sourceAnchor;
  mount(doc);
  edit('end', '5');
  expect(commit.mock.calls.at(-1)![0]).toMatchObject({ dormant: true, duration: 3 });
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'videoEditor.sidebar.sourceVoiceoverPlace'
  )!;
  act(() => button.click());
  expect(commit.mock.calls.at(-1)![0]).toMatchObject({
    dormant: false,
    timelineStart: 3,
    sourceAnchor: [{ start: 3, end: 7, offset: 0, duration: 4 }],
  });
});
it('disables all timing inputs and explicit placement on a locked selection', () => {
  const doc = fixture();
  doc.take.dormant = true;
  mount(doc, true);
  expect([...host.querySelectorAll<HTMLInputElement>('input')].every((node) => node.disabled)).toBe(
    true
  );
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'videoEditor.sidebar.sourceVoiceoverPlace'
  )!;
  expect(button.disabled).toBe(true);
  act(() => button.click());
  expect(commit).not.toHaveBeenCalled();
});

function panelFixture() {
  let project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: true,
  });
  const source = project.clips.find((clip) => clip.type === 'VIDEO');
  const original = project.clips.find((clip) => clip.type === 'AUDIO');
  if (source?.type !== 'VIDEO' || original?.type !== 'AUDIO')
    throw new Error('Missing original pair');
  const voice = createVideoProjectAsset(
    'Whole voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice-bytes' },
    {
      width: 0,
      height: 0,
      duration: 12,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
  const document = fixture();
  document.binding = {
    kind: 'source',
    assetId: source.assetId,
    sourceInstanceId: source.sourceInstanceId ?? source.id,
  };
  document.trackId = track.id;
  document.originalAudioSourceInstanceId = original.sourceInstanceId ?? original.id;
  document.take.assetId = voice.id;
  document.take.transcript = {
    version: 1,
    phrases: [],
    replacements: [],
    transcriptionModelId: 'retained-model',
  };
  document.take.textSnapshot = {
    kind: 'microphone',
    textId: 'retained-text',
    revision: 2,
    timingRevision: 1,
    text: 'Accepted script',
    start: 3,
    end: 7,
    timeDomain: 'source',
  };
  project = applyVideoProjectMutationPatch(project, {
    assets: [...project.assets, voice],
    tracks: [...project.tracks, track],
    sourceVoiceoverDocuments: [document],
  });
  expect(isExportReadyVideoProject(project)).toBe(true);
  return { project, source, original, track, voice };
}

function mountPanel(project: ReturnType<typeof panelFixture>['project'], forcedId?: string) {
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().selectSourceVoiceover('document');
  function Harness() {
    const current = useVideoEditorStore((state) => state.project)!;
    const selection = useVideoEditorStore((state) => state.selection);
    const documentId =
      forcedId ?? (selection.kind === 'source-voiceover' ? selection.documentId : null);
    return (
      <InspectorLayout>
        {documentId && <InspectSourceVoiceoverPanel project={current} documentId={documentId} />}
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness />));
}

function category(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('nav button')].find(
    (node) => node.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`Missing inspector category ${label}`);
  act(() => button.click());
}

function parameter(label: string) {
  const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing parameter ${label}`);
  return node;
}

function changeParameter(label: string, value: string) {
  const node = parameter(label);
  act(() => node.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  act(() => node.blur());
}

function panelAction(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('[data-inspector-action]')].find(
    (node) => node.textContent?.trim() === label
  );
  if (!button) throw new Error(`Missing inspector action ${label}`);
  return button;
}

it('edits the whole take through actual audio timing fades and original-source categories', () => {
  const { project } = panelFixture();
  mountPanel(project);
  const before = structuredClone(useVideoEditorStore.getState().project!);
  const enabled = host.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="gallery.videoReview.audioVoiceover"]'
  )!;
  const mute = host.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="gallery.videoReview.audioClipMute"]'
  )!;
  expect(enabled.getAttribute('aria-checked')).toBe('false');
  expect(mute.getAttribute('aria-checked')).toBe('false');
  act(() => enabled.click());
  act(() => mute.click());
  changeParameter('gallery.videoReview.audioClipVolume', '175');
  changeParameter('gallery.videoReview.voiceoverTempo', '1.5');
  category('videoEditor.sidebar.inspectorGroupAnimation');
  changeParameter('gallery.videoReview.audioFadeIn', '0.5');
  changeParameter('gallery.videoReview.audioFadeOut', '1.25');
  category('gallery.videoReview.audioOriginal');
  changeParameter('videoEditor.sidebar.originalAudioLevel', '25');
  category('videoEditor.sidebar.inspectorGroupTiming');
  changeParameter('videoEditor.app.sourcePosition', '4');
  const accepted = useVideoEditorStore.getState().project!;
  const document = accepted.sourceVoiceoverDocuments![0]!;
  expect(document).toMatchObject({
    enabled: true,
    originalAudioMuteVolume: 0.25,
    binding: before.sourceVoiceoverDocuments![0]!.binding,
    originalAudioSourceInstanceId:
      before.sourceVoiceoverDocuments![0]!.originalAudioSourceInstanceId,
  });
  expect(document.take).toMatchObject({
    id: 'take',
    sourceOffset: 2,
    duration: 4,
    timelineStart: 4,
    volume: 1.75,
    tempo: 1.5,
    muted: true,
    fadeIn: 0.5,
    fadeOut: 1.25,
    transcript: before.sourceVoiceoverDocuments![0]!.take.transcript,
    textSnapshot: before.sourceVoiceoverDocuments![0]!.take.textSnapshot,
  });
  expect(document.reference).toEqual(before.sourceVoiceoverDocuments![0]!.reference);
  expect(accepted.assets).toEqual(before.assets);
  expect(accepted.clips).toEqual(before.clips);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(8);
  expect(isExportReadyVideoProject(accepted)).toBe(true);
});

it('duplicates and deletes through actual inspector actions with whole-document history recovery', () => {
  const { project } = panelFixture();
  mountPanel(project);
  const before = useVideoEditorStore.getState().project!;
  const original = structuredClone(before.sourceVoiceoverDocuments![0]!);
  category('gallery.videoReview.actionActions');
  act(() => panelAction('videoEditor.timeline.duplicate').click());
  const copied = useVideoEditorStore.getState().project!;
  expect(copied.sourceVoiceoverDocuments).toHaveLength(2);
  const copy = copied.sourceVoiceoverDocuments![1]!;
  expect(copy.id).not.toBe(original.id);
  expect(copy.take.id).not.toBe(original.take.id);
  expect({ ...copy, id: original.id, take: { ...copy.take, id: original.take.id } }).toEqual(
    original
  );
  expect(useVideoEditorStore.getState().selection).toEqual({
    kind: 'source-voiceover',
    documentId: copy.id,
  });
  expect(copied.assets).toEqual(before.assets);
  expect(copied.clips).toEqual(before.clips);
  act(() => panelAction('videoEditor.timeline.delete').click());
  expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual([original]);
  expect(host.querySelector('[data-ui="video-editor.inspector.source-voiceover"]')).toBeNull();
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual(
    copied.sourceVoiceoverDocuments
  );
  expect(host.querySelector('[data-ui="video-editor.inspector.source-voiceover"]')).not.toBeNull();
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual([original]);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual(
    copied.sourceVoiceoverDocuments
  );
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual([original]);
});

it.each(['voice', 'source', 'original'] as const)(
  'disables every category edit and action when the %s track is locked',
  (kind) => {
    const { project, source, original, track } = panelFixture();
    const lockedTrackId =
      kind === 'voice' ? track.id : kind === 'source' ? source.trackId : original.trackId;
    project.tracks.find((entry) => entry.id === lockedTrackId)!.locked = true;
    mountPanel(project);
    const before = useVideoEditorStore.getState().project;
    const history = useVideoEditorStore.getState().projectHistory;
    const switches = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    expect(switches).toHaveLength(2);
    for (const toggle of switches) {
      expect(toggle.disabled).toBe(true);
      act(() => toggle.click());
    }
    expect(parameter('gallery.videoReview.audioClipVolume').disabled).toBe(true);
    expect(parameter('gallery.videoReview.voiceoverTempo').disabled).toBe(true);
    category('videoEditor.sidebar.inspectorGroupTiming');
    expect(
      [...host.querySelectorAll<HTMLInputElement>('input')].every((node) => node.disabled)
    ).toBe(true);
    category('videoEditor.sidebar.inspectorGroupAnimation');
    expect(parameter('gallery.videoReview.audioFadeIn').disabled).toBe(true);
    expect(parameter('gallery.videoReview.audioFadeOut').disabled).toBe(true);
    category('gallery.videoReview.audioOriginal');
    expect(parameter('videoEditor.sidebar.originalAudioLevel').disabled).toBe(true);
    category('gallery.videoReview.actionActions');
    for (const label of ['videoEditor.timeline.duplicate', 'videoEditor.timeline.delete']) {
      const action = panelAction(label);
      expect(action.disabled).toBe(true);
      act(() => action.click());
    }
    expect(useVideoEditorStore.getState().project).toBe(before);
    expect(useVideoEditorStore.getState().projectHistory).toBe(history);
  }
);

it('renders no settings for a missing whole-document selection', () => {
  const { project } = panelFixture();
  mountPanel(project, 'missing-document');
  expect(host.querySelector('[data-ui="video-editor.inspector.source-voiceover"]')).toBeNull();
  expect(host.querySelector('input')).toBeNull();
  expect(useVideoEditorStore.getState().project!.sourceVoiceoverDocuments).toEqual(
    project.sourceVoiceoverDocuments
  );
});

it('keeps retained source-less takes editable when the audio duration is unknown', () => {
  const { project, voice } = panelFixture();
  project.clips = [];
  project.assets.find((asset) => asset.id === voice.id)!.metadata.duration = null;
  mountPanel(project);
  const before = structuredClone(project.sourceVoiceoverDocuments![0]!);
  changeParameter('gallery.videoReview.audioClipVolume', '55');
  category('videoEditor.sidebar.inspectorGroupTiming');
  changeParameter('gallery.videoReview.rangeEnd', '5');
  const accepted = useVideoEditorStore.getState().project!;
  expect(accepted.sourceVoiceoverDocuments![0]!.take).toMatchObject({
    volume: 0.55,
    sourceOffset: 2,
    duration: 3,
    transcript: before.take.transcript,
    textSnapshot: before.take.textSnapshot,
  });
  expect(accepted.sourceVoiceoverDocuments![0]!.binding).toEqual(before.binding);
  expect(accepted.clips).toEqual([]);
  expect(isExportReadyVideoProject(accepted)).toBe(true);
});
