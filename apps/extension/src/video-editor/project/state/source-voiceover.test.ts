import { createAudioClipFromAsset } from '../../../features/video/project/factories/clip';
import { editSourceVoiceoverTiming } from '../../../features/video/project/source-voiceover-timing';
import { expect, it } from 'vitest';
import { useVideoEditorStore } from '../../state/store';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import type { VideoProjectSourceVoiceoverDocument } from '../../../features/video/project/source-voiceover';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
import {
  resolveSelectionAfterProjectUpdate,
  resolveSelectedTrackIdFromSelection,
} from './selection';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source');
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const audio = createVideoProjectAsset(
    'Voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice-bytes' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  project.tracks.push(track);
  project.assets.push(audio);
  const document: VideoProjectSourceVoiceoverDocument = {
    id: 'document',
    trackId: track.id,
    binding: {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
    enabled: false,
    originalAudioMuteVolume: 0.25,
    reference: buildReviewTimeMap(8, []),
    take: {
      id: 'take',
      assetId: audio.id,
      timelineStart: 1,
      sourceOffset: 0.5,
      duration: 4,
      volume: 1.5,
      muted: true,
      fadeIn: 0.25,
      fadeOut: 0.5,
      tempo: 0.5,
      sourceAnchor: [
        { start: 1, end: 2, offset: 0, duration: 1 },
        { start: 4, end: 7, offset: 1, duration: 3 },
      ],
      transcript: { version: 1, phrases: [], replacements: [] },
      textSnapshot: {
        kind: 'microphone',
        textId: 'text',
        revision: 0,
        timingRevision: 0,
        text: 'Accepted script',
        start: 1,
        end: 7,
        timeDomain: 'source',
      },
    },
  };
  const store = useVideoEditorStore;
  store.setState(store.getInitialState(), true);
  store
    .getState()
    .setProject(applyVideoProjectMutationPatch(project, { sourceVoiceoverDocuments: [document] }));
  return { store, clip, audio, track, document };
}

it('selects the whole disabled take, resolves its track, clears placement and rejects missing identities', () => {
  const { store, track } = fixture();
  store.setState({ placementMode: { kind: 'action-point', eventId: 'event', clipId: null } });
  store.getState().selectSourceVoiceover('document');
  const state = store.getState();
  expect(state.selection).toEqual({ kind: 'source-voiceover', documentId: 'document' });
  expect(state.selectedTrackId).toBe(track.id);
  expect(state.placementMode).toBeNull();
  expect(resolveSelectionAfterProjectUpdate(state.project!, state.selection)).toBe(state.selection);
  expect(resolveSelectedTrackIdFromSelection(state.project!, state.selection)).toBe(track.id);
  store.getState().selectSourceVoiceover('missing');
  expect(store.getState()).toBe(state);
});

it('edits with one history entry, restores full take and selection with Undo and Redo, and branches history', () => {
  const { store } = fixture();
  store.getState().selectSourceVoiceover('document');
  const before = store.getState().project!;
  const original = before.sourceVoiceoverDocuments![0]!;
  expect(
    store.getState().editSourceVoiceover(before, original.id, {
      take: { ...original.take, volume: 0.75 },
      enabled: true,
    })
  ).toBe(true);
  const changed = store.getState().project!;
  expect(store.getState().projectHistory.past).toHaveLength(1);
  expect(changed.sourceVoiceoverDocuments![0]!.take.volume).toBe(0.75);
  store.getState().undoProject();
  expect(store.getState().project).toEqual({ ...before, updatedAt: expect.any(Number) });
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: original.id });
  store.getState().redoProject();
  expect(store.getState().project).toEqual({ ...changed, updatedAt: expect.any(Number) });
  store.getState().undoProject();
  const current = store.getState().project!;
  expect(store.getState().editSourceVoiceover(current, original.id, { enabled: true })).toBe(true);
  const branch = store.getState().project;
  store.getState().redoProject();
  expect(store.getState().project).toBe(branch);
});

it('preserves root and history after stale, invalid, missing and no-op edits', () => {
  const { store } = fixture();
  const before = store.getState().project!;
  const take = before.sourceVoiceoverDocuments![0]!.take;
  const history = store.getState().projectHistory;
  expect(
    store.getState().editSourceVoiceover(structuredClone(before), 'document', { enabled: true })
  ).toBe(false);
  expect(store.getState().editSourceVoiceover(before, 'missing', { enabled: true })).toBe(false);
  expect(
    store.getState().editSourceVoiceover(before, 'document', { take: { ...take, volume: NaN } })
  ).toBe(false);
  expect(
    store
      .getState()
      .editSourceVoiceover(before, 'document', { take: { ...take, assetId: 'replacement' } })
  ).toBe(false);
  expect(store.getState().editSourceVoiceover(before, 'document', { enabled: false })).toBe(true);
  expect(store.getState().duplicateSourceVoiceover('missing')).toBeNull();
  store.getState().deleteSourceVoiceover('missing');
  expect(store.getState().project).toBe(before);
  expect(store.getState().projectHistory).toBe(history);
});

it(
  'duplicates complete authored data with independent IDs and shared bytes ' +
    'and restores exact selection through history',
  () => {
    const { store } = fixture();
    store.getState().selectSourceVoiceover('document');
    const before = store.getState().project!;
    const original = before.sourceVoiceoverDocuments![0]!;
    const id = store.getState().duplicateSourceVoiceover(original.id);
    expect(id).not.toBeNull();
    const copied = store.getState().project!;
    const copy = copied.sourceVoiceoverDocuments![1]!;
    expect(copy.id).toBe(id);
    expect(copy.take.id).not.toBe(original.take.id);
    expect({ ...copy, id: original.id, take: { ...copy.take, id: original.take.id } }).toEqual(
      original
    );
    expect(copy.take).not.toBe(original.take);
    expect(copy.reference).not.toBe(original.reference);
    expect(copy.take.textSnapshot).not.toBe(original.take.textSnapshot);
    expect(copied.assets).toEqual(before.assets);
    expect(copied.clips).toEqual(before.clips);
    expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: id });
    store.getState().undoProject();
    expect(store.getState().project).toEqual({ ...before, updatedAt: expect.any(Number) });
    expect(store.getState().selection).toEqual({
      kind: 'source-voiceover',
      documentId: original.id,
    });
    store.getState().redoProject();
    expect(store.getState().project).toEqual({ ...copied, updatedAt: expect.any(Number) });
    expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: id });
    const accepted = store.getState().project!;
    expect(
      store.getState().editSourceVoiceover(accepted, id!, { take: { ...copy.take, volume: 0.1 } })
    ).toBe(true);
    expect(store.getState().project!.sourceVoiceoverDocuments![0]).toEqual(original);
  }
);

it('deletes only the whole take and restores it and selection with Undo and Redo', () => {
  const { store } = fixture();
  store.getState().selectSourceVoiceover('document');
  const before = store.getState().project!;
  store.getState().deleteSourceVoiceover('document');
  const deleted = store.getState().project!;
  expect(deleted.sourceVoiceoverDocuments).toEqual([]);
  expect(deleted.assets).toEqual(before.assets);
  expect(deleted.clips).toEqual(before.clips);
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  store.getState().undoProject();
  expect(store.getState().project).toEqual({ ...before, updatedAt: expect.any(Number) });
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: 'document' });
  store.getState().redoProject();
  expect(store.getState().project).toEqual({ ...deleted, updatedAt: expect.any(Number) });
  expect(store.getState().selection).toEqual({ kind: 'scene' });
});

it.each(['source', 'voice'])(
  'permits inspection but refuses edit, delete and duplicate with a locked %s track',
  (kind) => {
    const { store, clip, track } = fixture();
    store.getState().toggleTrackLock(kind === 'source' ? clip.trackId : track.id);
    store.getState().selectSourceVoiceover('document');
    const before = store.getState().project!;
    const history = store.getState().projectHistory;
    expect(store.getState().selection).toEqual({
      kind: 'source-voiceover',
      documentId: 'document',
    });
    expect(store.getState().editSourceVoiceover(before, 'document', { enabled: true })).toBe(false);
    store.getState().deleteSourceVoiceover('document');
    expect(store.getState().duplicateSourceVoiceover('document')).toBeNull();
    expect(store.getState().project).toBe(before);
    expect(store.getState().projectHistory).toBe(history);
  }
);

it('retains dormant takes and selection after source removal and permits whole-take edits', () => {
  const { store, clip } = fixture();
  store.getState().selectSourceVoiceover('document');
  store.getState().deleteClip(clip.id);
  let current = store.getState().project!;
  const take = current.sourceVoiceoverDocuments![0]!.take;
  const dormant = { ...take, dormant: true };
  delete dormant.sourceAnchor;
  expect(store.getState().editSourceVoiceover(current, 'document', { take: dormant })).toBe(true);
  current = store.getState().project!;
  expect(isExportReadyVideoProject(current)).toBe(true);
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: 'document' });
  expect(store.getState().duplicateSourceVoiceover('document')).not.toBeNull();
  store.getState().deleteSourceVoiceover('document');
  expect(store.getState().project!.sourceVoiceoverDocuments).toHaveLength(1);
});

it('refuses an over-budget duplicate without partial history or asset changes', () => {
  const { store } = fixture();
  const original = store.getState().project!;
  const document = original.sourceVoiceoverDocuments![0]!;
  store.getState().setProject(
    applyVideoProjectMutationPatch(original, {
      sourceVoiceoverDocuments: Array.from({ length: 512 }, (_, i) => ({
        ...document,
        id: `doc-${i}`,
        take: { ...document.take, id: `take-${i}` },
      })),
    })
  );
  const current = store.getState().project;
  const history = store.getState().projectHistory;
  expect(store.getState().duplicateSourceVoiceover('doc-0')).toBeNull();
  expect(store.getState().project).toBe(current);
  expect(store.getState().projectHistory).toBe(history);
});

it('clears selected voice after owning track deletion and restores selection with Undo and Redo', () => {
  const { store, track } = fixture();
  store.getState().selectSourceVoiceover('document');
  const before = store.getState().project!;
  store.getState().deleteTrack(track.id);
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual([]);
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  store.getState().undoProject();
  expect(store.getState().project).toEqual({ ...before, updatedAt: expect.any(Number) });
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: 'document' });
  expect(store.getState().selectedTrackId).toBe(track.id);
  store.getState().redoProject();
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  expect(store.getState().project!.tracks.some((item) => item.id === track.id)).toBe(false);
});

it('keeps inspection available for hidden tracks and retains selection after source track deletion', () => {
  const { store, clip, track } = fixture();
  store.getState().toggleTrackVisibility(track.id);
  store.getState().selectSourceVoiceover('document');
  expect(store.getState().selectedTrackId).toBe(track.id);
  const before = store.getState().project!;
  expect(store.getState().editSourceVoiceover(before, 'document', { enabled: true })).toBe(true);
  store.getState().addTrack('PRIMARY');
  const sourceTrack = store
    .getState()
    .project!.tracks.find((item) => item.kind === 'PRIMARY' && item.id !== clip.trackId)!;
  store.getState().moveClip(clip.id, 0, sourceTrack.id);
  store.getState().selectSourceVoiceover('document');
  store.getState().deleteTrack(sourceTrack.id);
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: 'document' });
  expect(store.getState().project!.sourceVoiceoverDocuments).toHaveLength(1);
  expect(isExportReadyVideoProject(store.getState().project)).toBe(true);
});

it('preserves TRACK and CLIP selection behavior after deleting their track', () => {
  const { store, clip } = fixture();
  store.getState().addTrack('PRIMARY');
  const destination = store
    .getState()
    .project!.tracks.find((item) => item.kind === 'PRIMARY' && item.id !== clip.trackId)!;
  store.getState().moveClip(clip.id, 0, destination.id);
  store.getState().selectClip(clip.id);
  store.getState().deleteTrack(destination.id);
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  store.getState().undoProject();
  expect(store.getState().selection).toEqual({ kind: 'clip', clipId: clip.id });
  store.getState().selectTrack(destination.id);
  store.getState().deleteTrack(destination.id);
  expect(store.getState().selection).toEqual({
    kind: 'track',
    trackId: store.getState().project!.tracks[0]!.id,
  });
});

it('commits a native trim through exact-root history and restores the complete capture on Undo', () => {
  const { store } = fixture();
  store.getState().selectSourceVoiceover('document');
  const before = store.getState().project!;
  const original = before.sourceVoiceoverDocuments![0]!;
  const take = editSourceVoiceoverTiming(original, { kind: 'start', time: 1.5 }, 8)!;
  expect(take).not.toBeNull();
  expect(store.getState().editSourceVoiceover(before, original.id, { take })).toBe(true);
  expect(store.getState().projectHistory.past).toHaveLength(1);
  const after = store.getState().project!;
  expect(after.clips).toEqual(before.clips);
  expect(after.assets).toEqual(before.assets);
  expect(after.sourceVoiceoverDocuments![0]!.reference).toEqual(original.reference);
  expect(after.sourceVoiceoverDocuments![0]!.binding).toEqual(original.binding);
  expect(after.sourceVoiceoverDocuments![0]!.enabled).toBe(false);
  expect(after.sourceVoiceoverDocuments![0]!.take).toMatchObject({
    sourceOffset: 1.5,
    duration: 3,
    transcript: original.take.transcript,
    textSnapshot: original.take.textSnapshot,
  });
  expect(store.getState().editSourceVoiceover(before, original.id, { take: original.take })).toBe(
    false
  );
  expect(store.getState().project).toBe(after);
  store.getState().undoProject();
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual(
    before.sourceVoiceoverDocuments
  );
  store.getState().redoProject();
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual(
    after.sourceVoiceoverDocuments
  );
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: original.id });
});

function pairedFixture() {
  const { store, clip } = fixture();
  const project = store.getState().project!;
  const source = project.assets.find((asset) => asset.id === clip.assetId)!;
  const originalTrack = createVideoProjectTrack('Original', 2, 'AUDIO');
  const original = createAudioClipFromAsset(originalTrack.id, source);
  const document = project.sourceVoiceoverDocuments![0]!;
  store.getState().setProject(
    applyVideoProjectMutationPatch(project, {
      tracks: [...project.tracks, originalTrack],
      clips: [...project.clips, original],
      sourceVoiceoverDocuments: [{ ...document, originalAudioSourceInstanceId: original.id }],
    })
  );
  expect(isExportReadyVideoProject(store.getState().project)).toBe(true);
  return { store, originalTrack, original };
}

it('refuses whole-take mutations when the paired original AUDIO track is locked without changing history', () => {
  const { store, originalTrack } = pairedFixture();
  store.getState().toggleTrackLock(originalTrack.id);
  store.getState().selectSourceVoiceover('document');
  const before = store.getState().project!;
  const history = store.getState().projectHistory;
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: 'document' });
  expect(store.getState().editSourceVoiceover(before, 'document', { enabled: true })).toBe(false);
  expect(store.getState().duplicateSourceVoiceover('document')).toBeNull();
  store.getState().deleteSourceVoiceover('document');
  expect(store.getState().project).toBe(before);
  expect(store.getState().projectHistory).toBe(history);
});

it('keeps the paired original identity through whole-take edits duplication and history', () => {
  const { store, original } = pairedFixture();
  store.getState().selectSourceVoiceover('document');
  const before = store.getState().project!;
  expect(store.getState().editSourceVoiceover(before, 'document', { enabled: true })).toBe(true);
  const edited = store.getState().project!;
  const copyId = store.getState().duplicateSourceVoiceover('document');
  expect(copyId).not.toBeNull();
  const copied = store.getState().project!;
  expect(
    copied.sourceVoiceoverDocuments!.map((document) => document.originalAudioSourceInstanceId)
  ).toEqual([original.id, original.id]);
  expect(copied.assets).toEqual(before.assets);
  expect(copied.clips).toEqual(before.clips);
  store.getState().undoProject();
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual(
    edited.sourceVoiceoverDocuments
  );
  store.getState().undoProject();
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual(
    before.sourceVoiceoverDocuments
  );
  store.getState().redoProject();
  store.getState().redoProject();
  expect(store.getState().project!.sourceVoiceoverDocuments).toEqual(
    copied.sourceVoiceoverDocuments
  );
  expect(store.getState().selection).toEqual({ kind: 'source-voiceover', documentId: copyId });
});
