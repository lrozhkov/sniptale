import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from './factories/creation';
import {
  addProjectSourceAudioDocument,
  applyProjectSourceAudioEdit,
  duplicateProjectSourceAudioDocuments,
} from './source-audio-authoring';
import type { VideoProjectSourceAudioDocument } from './source-audio';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source placement');
  const document: VideoProjectSourceAudioDocument = {
    id: 'source-gain',
    binding: {
      kind: 'source',
      assetId: clip.assetId,
      sourceInstanceId: clip.sourceInstanceId ?? clip.id,
    },
    ranges: [{ id: 'manual', start: 1, end: 3, volume: 2 }],
    mutes: [],
  };
  project.sourceAudioDocuments = [document];
  return { project, clip, document };
}

it('refuses stale source edits without changing the accepted root', () => {
  const { project, document } = fixture();
  const before = structuredClone(project);
  expect(
    applyProjectSourceAudioEdit(project, structuredClone(document), { ranges: [], mutes: [] })
  ).toEqual({ ok: false, reason: 'stale' });
  expect(project).toEqual(before);
});

it('retries a refused source edit against the current basis', () => {
  const { project, document } = fixture();
  const patch = { ranges: [{ ...document.ranges[0]!, volume: 0.5 }], mutes: [] };
  expect(applyProjectSourceAudioEdit(project, structuredClone(document), patch).ok).toBe(false);
  const result = applyProjectSourceAudioEdit(project, document, patch);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected admitted edit');
  expect(result.project.version).toBe(28);
  expect(result.document?.ranges[0]?.volume).toBe(0.5);
  expect(document.ranges[0]?.volume).toBe(2);
  expect(applyProjectSourceAudioEdit(result.project, document, patch)).toEqual({
    ok: false,
    reason: 'stale',
  });
});

it('protects locked bound placements while allowing hidden and dormant source editing', () => {
  const { project, clip, document } = fixture();
  const track = project.tracks.find((item) => item.id === clip.trackId)!;
  track.visible = false;
  expect(applyProjectSourceAudioEdit(project, document, { ranges: [], mutes: [] }).ok).toBe(true);
  track.locked = true;
  expect(applyProjectSourceAudioEdit(project, document, null)).toEqual({
    ok: false,
    reason: 'locked',
  });
  project.clips = [];
  expect(applyProjectSourceAudioEdit(project, document, { ranges: [], mutes: [] }).ok).toBe(true);
});

it('preserves no-op identity and refuses malformed or conflicting additions atomically', () => {
  const { project, document } = fixture();
  expect(
    applyProjectSourceAudioEdit(project, document, {
      ranges: document.ranges,
      mutes: document.mutes,
    })
  ).toMatchObject({ ok: true, project, document });
  const noOp = applyProjectSourceAudioEdit(project, document, {
    ranges: document.ranges,
    mutes: document.mutes,
  });
  if (!noOp.ok) throw new Error('Expected no-op');
  expect(noOp.project).toBe(project);
  expect(addProjectSourceAudioDocument(project, { ...document, id: 'alias' })).toEqual({
    ok: false,
    reason: 'invalid',
  });
  expect(
    applyProjectSourceAudioEdit(project, document, {
      ranges: [{ ...document.ranges[0]!, end: 11 }],
      mutes: [],
    })
  ).toEqual({ ok: false, reason: 'invalid' });
  const removed = applyProjectSourceAudioEdit(project, document, null);
  expect(removed.ok).toBe(true);
  if (!removed.ok) throw new Error('Expected removal');
  expect(removed.project.sourceAudioDocuments).toEqual([]);
  expect(project.sourceAudioDocuments).toEqual([document]);
});

it('copies exact source intent to independent mapped instances without sharing mutable content', () => {
  const { document } = fixture();
  const result = duplicateProjectSourceAudioDocuments(
    [document],
    new Map([[document.binding.sourceInstanceId, 'copy']]),
    () => 'copy-doc'
  );
  expect(result?.[1]).toEqual({
    ...document,
    id: 'copy-doc',
    binding: { ...document.binding, sourceInstanceId: 'copy' },
  });
  result![1]!.ranges[0]!.volume = 0;
  expect(document.ranges[0]?.volume).toBe(2);
});

it('refuses document duplication above the aggregate budget without partial clips', () => {
  const { document } = fixture();
  const documents = Array.from({ length: 10 }, (_, i) => ({
    ...document,
    id: String(i),
    binding: { ...document.binding, sourceInstanceId: String(i) },
    ranges: Array.from({ length: 500 }, (_, j) => ({
      id: String(j),
      start: j,
      end: j + 0.5,
      volume: 1,
    })),
  }));
  const before = structuredClone(documents);
  expect(
    duplicateProjectSourceAudioDocuments(documents, new Map([['0', 'copy']]), () => 'copy')
  ).toBeNull();
  expect(documents).toEqual(before);
  expect(duplicateProjectSourceAudioDocuments(documents, new Map(), () => 'unused')).toEqual(
    before
  );
});

function retainedSpeechFixture() {
  const value = fixture();
  value.project.version = 31;
  value.document.speech = {
    enabled: false,
    transcript: {
      version: 1,
      replacements: [],
      transcriptionModelId: 'recognition',
      profile: { modelId: 'speech', voiceId: 'voice', responseFormat: 'wav' },
      phrases: [
        {
          id: 'phrase',
          start: 1,
          end: 2,
          originalText: 'Original',
          text: 'Draft',
          revision: 2,
          alignment: 'word',
          words: [{ text: 'Original', start: 1, end: 2 }],
        },
      ],
    },
  };
  return value;
}

it('clears the last envelope while retaining speech and makes a repeated clear a root no-op', () => {
  const { project, document } = retainedSpeechFixture();
  const before = structuredClone(project);
  const result = applyProjectSourceAudioEdit(project, document, null);
  if (!result.ok || !result.document) throw new Error('Expected retained speech document');
  expect(result.project.sourceAudioDocuments).toEqual([{ ...document, ranges: [], mutes: [] }]);
  expect(result.document.speech).toEqual(document.speech);
  const repeat = applyProjectSourceAudioEdit(result.project, result.document, null);
  if (!repeat.ok) throw new Error('Expected no-op clear');
  expect(repeat.project).toBe(result.project);
  expect(repeat.document).toBe(result.document);
  expect(project).toEqual(before);
});

it('does not let envelope patches replace recognition or binding and preserves stale and lock guards', () => {
  const { project, document, clip } = retainedSpeechFixture();
  const patch = {
    ranges: [],
    mutes: [],
    speech: { enabled: true, transcript: { version: 1, phrases: [], replacements: [] } },
    binding: { kind: 'source', assetId: 'foreign', sourceInstanceId: 'foreign' },
  };
  const before = structuredClone(project);
  expect(applyProjectSourceAudioEdit(project, structuredClone(document), patch)).toEqual({
    ok: false,
    reason: 'stale',
  });
  const sourceTrack = project.tracks.find((track) => track.id === clip.trackId)!;
  sourceTrack.locked = true;
  expect(applyProjectSourceAudioEdit(project, document, patch)).toEqual({
    ok: false,
    reason: 'locked',
  });
  sourceTrack.locked = false;
  const result = applyProjectSourceAudioEdit(project, document, patch);
  if (!result.ok || !result.document) throw new Error('Expected envelope clear');
  expect(result.document.speech).toEqual(document.speech);
  expect(result.document.binding).toEqual(document.binding);
  expect(project).toEqual(before);
});

it('copies retained speech to an independent instance without sharing nested transcript data', () => {
  const { document } = retainedSpeechFixture();
  const before = structuredClone(document);
  const result = duplicateProjectSourceAudioDocuments(
    [document],
    new Map([[document.binding.sourceInstanceId, 'new-instance']]),
    () => 'new-document'
  );
  expect(result).toHaveLength(2);
  expect(result![1]).toEqual({
    ...document,
    id: 'new-document',
    binding: { ...document.binding, sourceInstanceId: 'new-instance' },
  });
  result![1]!.speech!.enabled = true;
  result![1]!.speech!.transcript.phrases[0]!.words![0]!.text = 'Changed';
  result![1]!.speech!.transcript.profile!.voiceId = 'other';
  expect(document).toEqual(before);
});
