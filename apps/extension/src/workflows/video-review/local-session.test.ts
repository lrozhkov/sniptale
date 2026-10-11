import { expect, it } from 'vitest';
import { applyLocalReviewChange, prepareReviewSpeechTranscriptChange } from './local-session';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../features/video/review/document';
import {
  anchorReviewVoiceover,
  projectReviewVoiceover,
} from '../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit, ReviewOperation } from '../../features/video/review/types';
import { readFileSync } from 'node:fs';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';

function initial(): VideoWorkspaceSnapshot {
  return {
    workspace: {
      aggregateId: 'recording:voice-tempo',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 12, width: 1280, height: 720, mimeType: 'video/webm', size: 1000 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
}

function document(snapshot: VideoWorkspaceSnapshot) {
  const { workspace } = snapshot;
  return replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
}

function commit(snapshot: VideoWorkspaceSnapshot, operation: ReviewOperation) {
  return applyLocalReviewChange(snapshot, { kind: 'commit', operation, consumeDraft: false });
}

it('applies locally with Undo/Redo and clears only discarded resources', async () => {
  const opened = initial();
  const source = readFileSync(
    'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  const effect = readReviewAnnotationEffectDocument(source)!;
  const retained: ReviewAnnotationEffectSnapshot = {
    id: `effect:${sha256}`,
    sha256,
    source,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: effect.id,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    assets: [],
  };
  const before = document(opened).advancedContent;
  const after = {
    ...before,
    annotationEffects: {
      enabled: true,
      instances: [
        {
          id: 'annotation',
          snapshotId: retained.id,
          start: 1,
          end: 4,
          enabled: true,
          attachment: 'content' as const,
          controls: {},
          order: 0,
          transform: { x: 0, y: 0, width: 0.5, height: 0.3, rotation: 0 },
        },
      ],
    },
  };
  const operation: ReviewOperation = {
    id: 'effect',
    at: 1,
    target: 'advancedContent',
    before,
    after,
  };
  const saved = applyLocalReviewChange(opened, {
    kind: 'commit',
    operation,
    consumeDraft: false,
    effectSnapshots: [retained],
  });
  expect(saved.workspace.revision).toBe(opened.workspace.revision);
  expect(saved.draft).toEqual(opened.draft);
  expect(saved.workspace.effectSnapshots).toEqual([retained]);
  expect(saved.workspace.history).toHaveLength(1);
  expect(opened.workspace).not.toHaveProperty('effectSnapshots');
  const undone = applyLocalReviewChange(saved, { kind: 'history', direction: 'undo' });
  expect(undone.workspace.effectSnapshots).toEqual([retained]);
  expect(document(undone).advancedContent.annotationEffects).toBeUndefined();
  expect(
    document(applyLocalReviewChange(undone, { kind: 'history', direction: 'redo' })).advancedContent
      .annotationEffects
  ).toEqual(after.annotationEffects);
  const branch = applyLocalReviewChange(undone, {
    kind: 'commit',
    consumeDraft: false,
    operation: {
      id: 'branch',
      at: 2,
      target: 'advancedContent',
      before,
      after: {
        ...before,
        audio: { ...before.audio, original: { ...before.audio.original, volume: 0.2 } },
      },
    },
  });
  expect(branch.workspace.effectSnapshots).toEqual([]);
  expect(applyLocalReviewChange(saved, { kind: 'reset' }).workspace.effectSnapshots).toEqual([]);
  expect(() =>
    applyLocalReviewChange(saved, {
      kind: 'commit',
      operation,
      consumeDraft: false,
      effectSnapshots: [
        {
          ...retained,
          source: retained.source + ' ',
          retainedByteLength: retained.retainedByteLength + 1,
        },
      ],
    })
  ).toThrow('immutable');
  expect(saved.workspace.effectSnapshots).toEqual([retained]);
});

it('prepares original speech without changing authored text, captions, gain or visibility', () => {
  const before = document(initial()).advancedContent;
  const transcript = { version: 1 as const, phrases: [], replacements: [] };
  before.audio.original.volume = 0.4;
  before.audio.originalSpeech = { enabled: false, transcript };
  const captured = {
    ...transcript,
    profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const },
  };
  const frozen = structuredClone(before);
  const change = prepareReviewSpeechTranscriptChange(
    before,
    { kind: 'original' },
    'source',
    'source',
    captured
  )!;
  expect(before).toEqual(frozen);
  expect(change.before).toBe(before);
  expect(change.after).toEqual({
    ...before,
    audio: { ...before.audio, originalSpeech: { enabled: false, transcript: captured } },
  });
  expect(
    prepareReviewSpeechTranscriptChange(
      change.after,
      { kind: 'original' },
      'source',
      'source',
      structuredClone(captured)
    )
  ).toBeNull();
  expect(() =>
    prepareReviewSpeechTranscriptChange(
      before,
      { kind: 'original' },
      'source',
      'changed-source',
      captured
    )
  ).toThrow('changed');
});

it('updates only the matching voice transcript and refuses a changed or missing clip asset', () => {
  const before = document(initial()).advancedContent;
  const clip = {
    id: 'voice',
    assetId: 'voice-asset',
    timelineStart: 1,
    sourceOffset: 0,
    duration: 2,
    volume: 0.6,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  before.audio.voiceover = [clip, { ...clip, id: 'neighbor' }];
  const captured = { version: 1 as const, phrases: [], replacements: [] };
  const target = { kind: 'voiceover' as const, clipId: 'voice' };
  const change = prepareReviewSpeechTranscriptChange(
    before,
    target,
    'source',
    'voice-asset',
    captured
  )!;
  expect(change.after.audio.voiceover).toEqual([
    { ...clip, transcript: captured },
    { ...clip, id: 'neighbor' },
  ]);
  expect(before.audio.voiceover[0]?.transcript).toBeUndefined();
  expect(
    prepareReviewSpeechTranscriptChange(
      change.after,
      target,
      'source',
      'voice-asset',
      structuredClone(captured)
    )
  ).toBeNull();
  expect(() =>
    prepareReviewSpeechTranscriptChange(before, target, 'source', 'changed-asset', captured)
  ).toThrow('changed');
  expect(() =>
    prepareReviewSpeechTranscriptChange(
      before,
      { kind: 'voiceover', clipId: 'missing' },
      'source',
      'voice-asset',
      captured
    )
  ).toThrow('changed');
});

it.each([2, 0.5, 0.75] as const)(
  'persists decimal voice insertion, overlapping voices and history under Speed %sx',
  (rate) => {
    const speed: ReviewEdit = {
      id: 's',
      kind: 'speed',
      start: 2,
      end: 8,
      requestedStart: 2,
      requestedEnd: 8,
      rate,
      audio: 'speed',
    };
    let snapshot = commit(initial(), {
      id: 'speed',
      at: 1,
      target: 'edit',
      before: null,
      after: speed,
    });
    const before = document(snapshot).advancedContent;
    const map = buildReviewTimeMap(12, [speed]);
    const voiceover = [1.1, 1.3].map((timelineStart, index) =>
      anchorReviewVoiceover(
        {
          id: `v${index}`,
          assetId: 'voice-asset',
          timelineStart,
          sourceOffset: 0.2,
          duration: 3.3,
          volume: 1,
          muted: false,
          fadeIn: 0.2,
          fadeOut: 0.3,
        },
        map
      )
    );
    snapshot = commit(snapshot, {
      id: 'voices',
      at: 2,
      target: 'advancedContent',
      before,
      after: { ...before, audio: { ...before.audio, voiceover } },
    });
    const inspect = () => {
      const audio = document(snapshot).advancedContent.audio;
      const clips = projectReviewVoiceover(audio.voiceover, audio.voiceoverSegments);
      expect(clips).toHaveLength(2);
      clips.forEach((clip) => {
        expect(clip.playbackRate).toBe(1);
        expect(clip.duration).toBeCloseTo(3.3);
        expect(clip.sourceOffset).toBe(0.2);
      });
    };
    inspect();
    snapshot = applyLocalReviewChange(snapshot, { kind: 'history', direction: 'undo' });
    expect(document(snapshot).advancedContent.audio.voiceover).toEqual([]);
    snapshot = applyLocalReviewChange(snapshot, { kind: 'history', direction: 'redo' });
    inspect();
    snapshot = commit(snapshot, {
      id: 'remove-speed',
      at: 3,
      target: 'edit',
      before: speed,
      after: null,
    });
    inspect();
    const reopened = parseVideoWorkspace(JSON.parse(JSON.stringify(snapshot.workspace)));
    expect(reopened).toEqual(snapshot.workspace);
  }
);

it.each([2, 0.5] as const)(
  'restores native voice tempo after removing creation Speed %sx',
  (rate) => {
    const speed: ReviewEdit = {
      id: 'speed',
      kind: 'speed',
      start: 0,
      end: 8,
      requestedStart: 0,
      requestedEnd: 8,
      rate,
      audio: 'speed',
    };
    let snapshot = commit(initial(), {
      id: 'add-speed',
      at: 1,
      target: 'edit',
      before: null,
      after: speed,
    });
    const before = document(snapshot).advancedContent;
    const voice = anchorReviewVoiceover(
      {
        id: 'voice',
        assetId: 'voice-asset',
        timelineStart: 1,
        sourceOffset: 0.2,
        duration: 2,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
      buildReviewTimeMap(12, [speed])
    );
    snapshot = commit(snapshot, {
      id: 'add-voice',
      at: 2,
      target: 'advancedContent',
      before,
      after: { ...before, audio: { ...before.audio, voiceover: [voice] } },
    });
    const audible = () => {
      const audio = document(snapshot).advancedContent.audio;
      return projectReviewVoiceover(audio.voiceover, audio.voiceoverSegments);
    };
    expect(audible()).toMatchObject([{ playbackRate: 1, duration: 2, sourceOffset: 0.2 }]);
    snapshot = commit(snapshot, {
      id: 'remove-speed',
      at: 3,
      target: 'edit',
      before: speed,
      after: null,
    });
    expect(audible()).toMatchObject([{ playbackRate: 1, duration: 2, sourceOffset: 0.2 }]);
    expect(document(snapshot).advancedContent.audio.voiceover[0]).toMatchObject({
      duration: 2,
      sourceOffset: 0.2,
      timelineStart: rate,
    });
    const reopened = parseVideoWorkspace(JSON.parse(JSON.stringify(snapshot.workspace)));
    expect(reopened).not.toBeNull();
    snapshot = { ...snapshot, workspace: reopened! };
    expect(audible()).toMatchObject([{ playbackRate: 1, duration: 2 }]);
  }
);

it('applies absolute subsequent Speed and reopens old snapshot history without rewriting it', () => {
  const speed: ReviewEdit = {
    id: 'speed',
    kind: 'speed',
    start: 0,
    end: 8,
    requestedStart: 0,
    requestedEnd: 8,
    rate: 2,
    audio: 'speed',
  };
  let snapshot = initial();
  const legacyCommit = (operation: ReviewOperation) => {
    const workspace = parseVideoWorkspace({
      ...snapshot.workspace,
      history: [...snapshot.workspace.history, operation],
      cursor: snapshot.workspace.cursor + 1,
    });
    expect(workspace).not.toBeNull();
    snapshot = { ...snapshot, workspace: workspace! };
  };
  legacyCommit({
    id: 'legacy-speed',
    at: 1,
    target: 'edit',
    before: null,
    after: speed,
    preserveVoiceoverAnchors: true,
  });
  const before = document(snapshot).advancedContent;
  const recording = anchorReviewVoiceover(
    {
      id: 'voice',
      assetId: 'voice',
      timelineStart: 1,
      sourceOffset: 0.4,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0.1,
      fadeOut: 0.2,
    },
    buildReviewTimeMap(12, [speed])
  );
  legacyCommit({
    id: 'legacy-voice',
    at: 2,
    target: 'advancedContent',
    before,
    after: { ...before, audio: { ...before.audio, voiceover: [recording] } },
  });
  const legacyHistory = structuredClone(snapshot.workspace.history);
  const faster = { ...speed, rate: 4 as const };
  snapshot = commit(snapshot, {
    id: 'new-speed',
    at: 3,
    target: 'edit',
    before: speed,
    after: faster,
  });
  const audio = document(snapshot).advancedContent.audio;
  expect(projectReviewVoiceover(audio.voiceover, audio.voiceoverSegments)).toMatchObject([
    { playbackRate: 1, duration: 2, sourceOffset: 0.4 },
  ]);
  expect(snapshot.workspace.history.slice(0, 2)).toEqual(legacyHistory);
  const normalized = document(snapshot).advancedContent;
  snapshot = commit(snapshot, {
    id: 'new-audio-edit',
    at: 4,
    target: 'advancedContent',
    before: normalized,
    after: {
      ...normalized,
      audio: {
        ...normalized.audio,
        voiceover: normalized.audio.voiceover.map((voice) => ({ ...voice, volume: 0.7 })),
      },
    },
  });
  snapshot = commit(snapshot, { id: 'remove', at: 5, target: 'edit', before: faster, after: null });
  const removed = document(snapshot).advancedContent.audio;
  expect(projectReviewVoiceover(removed.voiceover, removed.voiceoverSegments)).toMatchObject([
    { playbackRate: 1, duration: 2, sourceOffset: 0.4, volume: 0.7 },
  ]);
  snapshot = applyLocalReviewChange(snapshot, { kind: 'history', direction: 'undo' });
  const undone = document(snapshot).advancedContent.audio;
  expect(projectReviewVoiceover(undone.voiceover, undone.voiceoverSegments)[0]?.playbackRate).toBe(
    1
  );
  snapshot = applyLocalReviewChange(snapshot, { kind: 'history', direction: 'redo' });
  const reopened = parseVideoWorkspace(JSON.parse(JSON.stringify(snapshot.workspace)));
  expect(reopened).toEqual(snapshot.workspace);
  expect(reopened?.history.slice(0, 2)).toEqual(legacyHistory);
  expect(recording.sourceAnchor).toEqual([{ start: 2, end: 6, offset: 0, duration: 2 }]);
});

it('roundtrips per-cut transition edits through workspace history without shifting montage time', () => {
  let snapshot = initial();
  const cut: ReviewEdit = {
    id: 'cut',
    kind: 'cut',
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
  };
  snapshot = commit(snapshot, { id: 'add', at: 1, target: 'edit', before: null, after: cut });
  const before = document(snapshot);
  const edited: ReviewEdit = {
    ...cut,
    transition: { type: 'dissolve', before: 0.25, after: 0.75 },
  };
  snapshot = commit(snapshot, {
    id: 'transition',
    at: 2,
    target: 'edit',
    before: cut,
    after: edited,
  });
  expect(document(snapshot).edits).toEqual([edited]);
  expect(buildReviewTimeMap(12, document(snapshot).edits)).toEqual(
    buildReviewTimeMap(12, before.edits)
  );
  expect(document(snapshot).advancedContent).toEqual(before.advancedContent);
  const reopened = parseVideoWorkspace(JSON.parse(JSON.stringify(snapshot.workspace)));
  expect(reopened).toEqual(snapshot.workspace);
  snapshot = { ...snapshot, workspace: reopened! };
  snapshot = applyLocalReviewChange(snapshot, { kind: 'history', direction: 'undo' });
  expect(document(snapshot).edits).toEqual([cut]);
  snapshot = applyLocalReviewChange(snapshot, { kind: 'history', direction: 'redo' });
  expect(document(snapshot).edits).toEqual([edited]);
});
