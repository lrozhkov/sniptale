import { expect, it } from 'vitest';
import { resolveSelectedClipId, VideoEditorSelectionKind } from './selection';

it('keeps history selection separate from editable clip selection', () => {
  expect(resolveSelectedClipId({ kind: VideoEditorSelectionKind.CLIP, clipId: 'video' })).toBe(
    'video'
  );
  expect(
    resolveSelectedClipId({
      kind: VideoEditorSelectionKind.ACTION_OCCURRENCE,
      eventId: 'click',
      clipId: 'video',
    })
  ).toBeNull();
  expect(
    resolveSelectedClipId({
      kind: VideoEditorSelectionKind.HISTORY_SPAN,
      clipId: 'video',
      recordingId: 'source',
      sourceInstanceId: 'instance',
      signalId: 'typing',
    })
  ).toBeNull();
});

it('does not expose a whole voice document as an editable clip', () => {
  expect(
    resolveSelectedClipId({ kind: VideoEditorSelectionKind.SOURCE_VOICEOVER, documentId: 'voice' })
  ).toBeNull();
});
