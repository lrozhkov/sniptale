import { argsFixture, contextFixture, state } from './render-export.test-support';
import { beforeEach, expect, it, vi } from 'vitest';
import { writeReviewFrames } from './render-export';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewTextFragment } from '../../features/video/review/text-types';
import { QuickEditExportUnavailable } from './export-unavailable';

const phrase = (id: string, start: number, end: number, text = 'Caption'): ReviewTextFragment => ({
  id,
  start,
  end,
  text,
  originalText: text,
  timeDomain: 'result',
  revision: 0,
  timingRevision: 0,
  alignment: 'manual',
  showInVideo: true,
});
const paints: { text: string; x: number; y: number }[] = [];
const font = vi.fn(async () => [{ status: 'loaded' }]);
beforeEach(() => {
  paints.length = 0;
  state.configurations.length = 0;
  font.mockClear();
  vi.stubGlobal('document', {
    fonts: { load: font, ready: Promise.resolve() },
    createElement: () => {
      const context = contextFixture();
      context.fillText = vi.fn((text, x, y) => {
        paints.push({ text, x, y });
      });
      return { width: 0, height: 0, getContext: () => context };
    },
  });
});
function captionArgs(fragments = [phrase('caption', 0, 2)]) {
  const args = argsFixture();
  args.advanced.captions = { ...createReviewCaptionSettings(), enabled: true };
  args.advanced.text = { version: 1, fragments };
  return args;
}
it('renders authored text on every applicable final frame without rewriting text or audio', async () => {
  const args = captionArgs();
  const original = structuredClone(args.advanced);
  await writeReviewFrames(args);
  expect(state.encoded.length).toBeGreaterThan(0);
  expect(paints.filter((paint) => paint.text === 'Caption')).toHaveLength(state.encoded.length);
  expect(font).toHaveBeenCalledOnce();
  expect(args.advanced).toEqual(original);
});
it.each(['off', 'hidden'] as const)(
  'does not paint or load fonts when captions are %s',
  async (kind) => {
    const args = captionArgs();
    if (kind === 'off') args.advanced.captions!.enabled = false;
    else args.advanced.text!.fragments[0]!.showInVideo = false;
    await writeReviewFrames(args);
    expect(paints).toEqual([]);
    expect(font).not.toHaveBeenCalled();
  }
);
it('rejects unsafe captions before encoder setup or output writes and reports the exact fragment', async () => {
  const args = captionArgs([phrase('too-long', 0, 2, 'word '.repeat(200))]);
  await expect(writeReviewFrames(args)).rejects.toMatchObject({
    reasons: ['caption-layout'],
    captionConflicts: [expect.objectContaining({ fragmentId: 'too-long', reason: 'space' })],
  });
  expect(state.configurations).toEqual([]);
  expect(state.encoded).toEqual([]);
  expect(args.writer.writeAt).not.toHaveBeenCalled();
});
it('preserves full-export caption coordinates in a fragment with a global time offset', async () => {
  const args = captionArgs([phrase('a', 0, 1.5, 'A'), phrase('b', 0.5, 2, 'B')]);
  await writeReviewFrames(args);
  const baseline = paints.find((paint) => paint.text === 'B')!;
  paints.length = 0;
  args.edits = [
    { id: 'fragment', kind: 'cut', start: 0, end: 1, requestedStart: 0, requestedEnd: 1 },
  ];
  await writeReviewFrames({
    ...args,
    fragmentOffset: 1,
    captionTimeMap: buildReviewTimeMap(2, []),
  });
  const fragment = paints.filter((paint) => paint.text === 'B');
  expect(fragment.length).toBeGreaterThan(0);
  expect(fragment.every((paint) => paint.x === baseline.x && paint.y === baseline.y)).toBe(true);
});
it('requires the full fragment map and ignores conflicts outside the export', async () => {
  const args = captionArgs([
    phrase('excluded-conflict', 0, 0.5, 'word '.repeat(200)),
    phrase('caption', 1, 2),
  ]);
  args.edits = [
    { id: 'fragment', kind: 'cut', start: 0, end: 1, requestedStart: 0, requestedEnd: 1 },
  ];
  await expect(writeReviewFrames({ ...args, fragmentOffset: 1 })).rejects.toThrow(
    'full document time map'
  );
  await expect(
    writeReviewFrames({ ...args, fragmentOffset: 1, captionTimeMap: buildReviewTimeMap(2, []) })
  ).resolves.toMatchObject({ videoReencoded: true });
  expect(paints.some((paint) => paint.text === 'Caption')).toBe(true);
  await expect(
    writeReviewFrames(captionArgs([phrase('included-conflict', 0, 2, 'word '.repeat(200))]))
  ).rejects.toBeInstanceOf(QuickEditExportUnavailable);
});
