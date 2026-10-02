import { expect, it } from 'vitest';
import { applyLocalReviewChange } from './local-session';
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
