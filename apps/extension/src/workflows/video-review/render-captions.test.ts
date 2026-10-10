import { afterEach, expect, it, vi } from 'vitest';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import type { ReviewTextFragment } from '../../features/video/review/text-types';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { prepareReviewCaptions } from './render-captions';
import { QuickEditExportUnavailable } from './export-unavailable';

const settings = { ...createReviewCaptionSettings(), enabled: true };
const phrase = (id: string, start: number, end: number, text: string): ReviewTextFragment => ({
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
function setup(
  fragments = [phrase('first', 0, 2, 'One'), phrase('second', 2, 4, 'First\nSecond')]
) {
  const measurement = {
    font: '',
    textAlign: '',
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
  };
  const canvas = { width: 1, height: 1, getContext: vi.fn(() => measurement) };
  const load = vi.fn(async () => [{ status: 'loaded' }]);
  const createElement = vi.fn(() => canvas);
  vi.stubGlobal('document', { fonts: { load }, createElement });
  const args = {
    document: { version: 1 as const, fragments },
    settings,
    segments: buildReviewTimeMap(10, []),
    output: { width: 640, height: 360 },
    signal: new AbortController().signal,
  };
  return { args, load, createElement, measurement, canvas };
}
afterEach(() => vi.unstubAllGlobals());
it('loads the bundled font once, releases measurement pixels and never measures while sampling frames', async () => {
  const fixture = setup();
  const prepared = await prepareReviewCaptions(fixture.args);
  expect(fixture.load).toHaveBeenCalledOnce();
  expect(fixture.canvas.width).toBe(0);
  const measured = fixture.measurement.measureText.mock.calls.length;
  const target = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  for (const time of [0, 1, 2, 3, 1, 9]) prepared.draw(target, time);
  expect(fixture.measurement.measureText).toHaveBeenCalledTimes(measured);
  const lines = vi.mocked(target.fillText).mock.calls;
  expect(lines.find((line) => line[0] === 'One')![2]).toBe(
    lines.find((line) => line[0] === 'Second')![2]
  );
  expect(vi.mocked(target.save).mock.calls.length).toBe(
    vi.mocked(target.restore).mock.calls.length
  );
  prepared.assertExportable();
});
it.each(['top', 'bottom'] as const)(
  'fits the %s background to authored lines while preserving anchors',
  async (position) => {
    const fixture = setup();
    const prepared = await prepareReviewCaptions({
      ...fixture.args,
      settings: { ...settings, style: { ...settings.style, position } },
    });
    const target = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    prepared.draw(target, 1);
    prepared.draw(target, 3);
    const one = prepared.plan.cues[0]!;
    const two = prepared.plan.cues[1]!;
    const boxes = vi.mocked(target.roundRect).mock.calls;
    expect(boxes[0]![3]).toBe(one.lineHeight + 2 * one.padding);
    expect(boxes[1]![3]).toBe(two.lineHeight * 2 + 2 * two.padding);
    if (position === 'bottom')
      expect(boxes[0]![1] + boxes[0]![3]).toBe(boxes[1]![1] + boxes[1]![3]);
    else expect(boxes[0]![1]).toBe(boxes[1]![1]);
    const lines = vi.mocked(target.fillText).mock.calls;
    expect(lines[0]![2]).toBe(lines[position === 'bottom' ? 2 : 1]![2]);
  }
);
it('awaits authored Latin Extended glyphs before freezing caption measurements', async () => {
  const hidden = { ...phrase('hidden', 0, 2, 'Ж'), showInVideo: false };
  const fixture = setup([phrase('visible', 0, 2, 'Łukasz'), hidden, phrase('cut', 20, 22, 'Ŕ')]);
  let completeSubset!: () => void;
  const subset = new Promise<void>((resolve) => {
    completeSubset = resolve;
  });
  fixture.load.mockImplementation(async (_font?: string, text?: string) => {
    if (text?.includes('Ł')) await subset;
    return [{ status: 'loaded' }];
  });
  const pending = prepareReviewCaptions(fixture.args);
  await Promise.resolve();
  expect(fixture.load).toHaveBeenCalledWith(expect.any(String), 'AaŁukasz');
  expect(fixture.measurement.measureText).not.toHaveBeenCalled();
  expect(fixture.createElement).not.toHaveBeenCalled();
  completeSubset();
  const prepared = await pending;
  expect(fixture.measurement.measureText).toHaveBeenCalled();
  expect(prepared.plan.cues[0]?.lines).toEqual(['Łukasz']);
});
it('preloads the base font when authored glyphs use system fallback', async () => {
  const fixture = setup([phrase('fallback', 0, 2, '字幕')]);
  fixture.load.mockImplementation(async (_font?: string, text?: string) =>
    text?.includes('A') ? [{ status: 'loaded' }] : []
  );
  const prepared = await prepareReviewCaptions(fixture.args);
  expect(fixture.load).toHaveBeenCalledWith(expect.any(String), 'Aa字幕');
  expect(prepared.plan.cues[0]?.lines).toEqual(['字幕']);
});
it.each(['off', 'hidden', 'empty', 'excluded'] as const)(
  'does not load fonts or allocate measurement for %s text',
  async (kind) => {
    const fixture = setup();
    if (kind === 'off') fixture.args.settings = { ...settings, enabled: false };
    if (kind === 'hidden')
      fixture.args.document.fragments.forEach((fragment) => {
        fragment.showInVideo = false;
      });
    if (kind === 'empty')
      fixture.args.document.fragments.forEach((fragment) => {
        fragment.text = ' ';
      });
    if (kind === 'excluded')
      fixture.args.document.fragments.forEach((fragment) => {
        fragment.start = 20;
        fragment.end = 22;
      });
    const prepared = await prepareReviewCaptions(fixture.args);
    prepared.assertExportable();
    expect(prepared.plan.cues).toEqual([]);
    expect(fixture.load).not.toHaveBeenCalled();
    expect(fixture.createElement).not.toHaveBeenCalled();
  }
);
it('checks cancellation after font loading before creating any measurement pixels', async () => {
  const fixture = setup();
  const controller = new AbortController();
  fixture.load.mockImplementation(async () => {
    controller.abort();
    return [{ status: 'loaded' }];
  });
  await expect(
    prepareReviewCaptions({ ...fixture.args, signal: controller.signal })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.createElement).not.toHaveBeenCalled();
});
it('fails unavailable font before measurement and releases the resource lease on layout failure', async () => {
  const fixture = setup();
  fixture.load.mockResolvedValue([]);
  await expect(prepareReviewCaptions(fixture.args)).rejects.toThrow('Caption font is unavailable');
  expect(fixture.createElement).not.toHaveBeenCalled();
  fixture.load.mockResolvedValue([{ status: 'loaded' }]);
  fixture.measurement.measureText.mockImplementation(() => {
    throw new Error('measurement failed');
  });
  const release = vi.fn();
  const resources = { canvas: vi.fn(() => ({ context: fixture.measurement, release })) };
  await expect(
    prepareReviewCaptions({ ...fixture.args, resources: resources as never })
  ).rejects.toThrow('measurement failed');
  expect(resources.canvas).toHaveBeenCalledWith('caption-measurement', { width: 1, height: 1 });
  expect(release).toHaveBeenCalledOnce();
});
it('admits fragment exports by their global range while retaining full-document stable slot geometry', async () => {
  const fixture = setup([
    phrase('early-conflict', 0, 1, 'One'),
    phrase('first', 2, 8, 'A'),
    phrase('second', 3, 6, 'B'),
  ]);
  const prepared = await prepareReviewCaptions({
    ...fixture.args,
    reservations: () => [{ x: 0, y: 300, width: 640, height: 60, start: 0, end: 1 }],
  });
  expect(() => prepared.assertExportable()).toThrow(QuickEditExportUnavailable);
  expect(() => prepared.assertExportable({ start: 4, end: 5 })).not.toThrow();
  expect(() => prepared.assertExportable({ start: 0, end: 0.5 })).toThrow(
    QuickEditExportUnavailable
  );
  expect(prepared.plan.cues.find((cue) => cue.fragmentId === 'second')!.y).toBeLessThan(
    prepared.plan.cues.find((cue) => cue.fragmentId === 'first')!.y
  );
});
