import { expect, it } from 'vitest';
import {
  parsePortableVideoReview,
  prepareVideoReviewRestore,
  readVideoReviewForBackup,
} from './backup-restore';
import type { VideoWorkspace } from './contracts';
import { collectReviewAssetReferences, encodePortableReviewAssetRefs } from './asset-refs';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import type { ReviewActionAudioSetting } from '../../../features/video/review/advanced/action-audio';
import { inspectVideoWorkspace } from './parser';
import { editReviewTextFragment } from '../../../features/video/review/text-document';
import { parseVideoWorkspaceTypingChange, prepareVideoWorkspaceTyping } from './typing';
import { workspace, snapshotDatabase } from './backup-restore.test-support';

it('exports authored typing history without receipts and refuses portable markers', async () => {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'field',
        start: 0,
        end: 1,
        text: 'Before',
        originalText: 'Before',
        revision: 0,
        timingRevision: 0,
        timeDomain: 'result',
        alignment: 'manual',
        showInVideo: false,
      },
    ],
  };
  const admitted = inspectVideoWorkspace({ ...workspace, advanced });
  if (!admitted.workspace || !admitted.document?.advancedContent.text)
    throw new Error('Invalid typed backup fixture');
  const changed = editReviewTextFragment(admitted.document.advancedContent.text, 'field', {
    text: 'After',
  });
  if (!changed.ok) throw new Error('Invalid fixture field');
  const change = parseVideoWorkspaceTypingChange({
    actionId: crypto.randomUUID(),
    writeId: crypto.randomUUID(),
    target: { kind: 'text', fragmentId: 'field', field: 'text' },
    continuation: false,
    at: 4,
    before: admitted.document.advancedContent,
    after: { ...admitted.document.advancedContent, text: changed.document },
  });
  if (!change) throw new Error('Invalid typed capture');
  const typed = prepareVideoWorkspaceTyping(admitted.workspace, admitted.document, change);
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(typed, undefined),
    aggregateId: typed.aggregateId,
    sourceAssetId: typed.sourceAssetId,
  });
  expect(exported?.workspace).not.toHaveProperty('typing');
  expect(exported?.workspace.history).toEqual(typed.history);
  const parsed = parsePortableVideoReview(
    encodePortableReviewAssetRefs(exported!),
    typed.aggregateId
  );
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: typed.aggregateId,
    targetAggregateId: 'recording:restored',
    sourceAssetId: 'new-object',
  });
  expect(restored.workspace).not.toHaveProperty('typing');
  expect(
    inspectVideoWorkspace(restored.workspace).document?.advancedContent.text?.fragments[0]?.text
  ).toBe('After');
  expect(() =>
    parsePortableVideoReview(
      { ...parsed, workspace: { ...parsed.workspace, typing: typed.typing } },
      typed.aggregateId
    )
  ).toThrow('invalid');
});

it('preserves typed action sound identities in baseline, Undo and dormant Redo without asset remapping', async () => {
  const advanced = createQuickEditAdvancedState();
  const baseline: ReviewActionAudioSetting[] = [
    {
      ref: { kind: 'action', id: 'same' },
      presetId: 'mouse-classic-v1',
      enabled: true,
      volume: 0.35,
      offset: -0.2,
    },
    {
      ref: { kind: 'signal', id: 'same' },
      presetId: 'typing-natural-v1',
      enabled: false,
      volume: 0.7,
      offset: 0.3,
    },
  ];
  advanced.actionAudio = baseline;
  const before = reviewAdvancedContentBaseline(advanced);
  const after = {
    ...before,
    actionAudio: [
      baseline[0]!,
      {
        ref: { kind: 'action' as const, id: 'unresolved' },
        presetId: 'keyboard-v1' as const,
        enabled: false,
        volume: 0.5,
        offset: 0,
      },
      baseline[1]!,
    ],
  };
  const stored: VideoWorkspace = {
    ...workspace,
    advanced,
    cursor: 0,
    history: [{ id: 'sound-op', at: 2, target: 'advancedContent', before, after }],
  };
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(exported!);
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:cloned',
    sourceAssetId: 'cloned-object',
    assetIdMap: new Map([['same', 'replaced']]),
  });
  expect(restored.workspace.advanced.actionAudio).toEqual(baseline);
  expect(restored.workspace.history).toMatchObject(stored.history);
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(new Set());
  for (const cursor of [0, 1]) {
    expect(
      replayReviewHistory(
        restored.workspace.history,
        cursor,
        restored.workspace.source,
        reviewAdvancedContentBaseline(restored.workspace.advanced)
      ).advancedContent.actionAudio
    ).toEqual(cursor === 0 ? baseline : after.actionAudio);
  }
});

it('restores mixed text provenance and source mutes while remapping only immutable assets', async () => {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'rewritten',
        text: 'New script',
        originalText: 'Old phrases',
        start: 0,
        end: 1,
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: false,
        derivedFrom: ['first', 'second'],
        origins: [
          { kind: 'original', start: 0, end: 1, words: [{ text: 'Old', start: 0, end: 1 }] },
          { kind: 'voiceover', clipId: 'take', start: 0, end: 1 },
        ],
      },
    ],
  };
  advanced.audio.voiceoverSegments = buildReviewTimeMap(workspace.source.duration, []);
  advanced.audio.voiceover = [
    {
      id: 'take',
      assetId: 'project-asset:voice',
      timelineStart: 0,
      duration: 1,
      sourceOffset: 0,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  advanced.audio.original.mutes = [
    { id: 'binding', kind: 'take', clipId: 'take' },
    { id: 'detached', kind: 'range', start: 0.5, end: 1.5, volume: 0.25 },
  ];
  const stored = { ...workspace, advanced, history: [], cursor: 0 };
  const exported = await readVideoReviewForBackup({
    db: snapshotDatabase(stored, undefined),
    aggregateId: stored.aggregateId,
    sourceAssetId: stored.sourceAssetId,
  });
  const portable = encodePortableReviewAssetRefs(exported!);
  const parsed = parsePortableVideoReview(JSON.parse(JSON.stringify(portable)), stored.aggregateId);
  const restored = prepareVideoReviewRestore({
    review: parsed,
    sourceAggregateId: stored.aggregateId,
    targetAggregateId: 'recording:copy',
    sourceAssetId: 'new-source',
    assetIdMap: new Map([['voice', 'new-voice']]),
  });
  expect(restored.workspace.advanced.audio.original.mutes).toEqual(advanced.audio.original.mutes);
  expect(restored.workspace.advanced.text).toEqual(advanced.text);
  expect(restored.workspace.advanced.audio.voiceover[0]).toMatchObject({
    id: 'take',
    assetId: 'project-asset:new-voice',
  });
  expect(collectReviewAssetReferences(restored.workspace)).toEqual(
    new Set(['project-asset:new-voice'])
  );
});
