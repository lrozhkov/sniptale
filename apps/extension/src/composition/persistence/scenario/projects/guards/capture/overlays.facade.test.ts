import { beforeEach, expect, it, vi } from 'vitest';

const {
  parseArrowOverlayMock,
  parseBlurOverlayMock,
  parseFocusRectOverlayMock,
  parsePointKindOverlayMock,
  parseRectKindOverlayMock,
  parseTextOverlayMock,
} = vi.hoisted(() => ({
  parseArrowOverlayMock: vi.fn(),
  parseBlurOverlayMock: vi.fn(),
  parseFocusRectOverlayMock: vi.fn(),
  parsePointKindOverlayMock: vi.fn(),
  parseRectKindOverlayMock: vi.fn(),
  parseTextOverlayMock: vi.fn(),
}));

vi.mock('./markers', () => ({
  parseArrowOverlay: parseArrowOverlayMock,
  parsePointKindOverlay: parsePointKindOverlayMock,
  parseTextOverlay: parseTextOverlayMock,
}));

vi.mock('./shapes', () => ({
  parseBlurOverlay: parseBlurOverlayMock,
  parseFocusRectOverlay: parseFocusRectOverlayMock,
  parseRectKindOverlay: parseRectKindOverlayMock,
}));

beforeEach(() => {
  parseArrowOverlayMock.mockReset();
  parseBlurOverlayMock.mockReset();
  parseFocusRectOverlayMock.mockReset();
  parsePointKindOverlayMock.mockReset();
  parseRectKindOverlayMock.mockReset();
  parseTextOverlayMock.mockReset();
});

it('dispatches overlay kinds to the expected role parsers', async () => {
  const { parseCaptureOverlays } = await import('./overlays');

  parseFocusRectOverlayMock.mockReturnValue({ id: 'focus', kind: 'focus-rect' });
  parsePointKindOverlayMock.mockReturnValue({ id: 'click', kind: 'click-ring' });
  parseBlurOverlayMock.mockReturnValue({ id: 'blur', kind: 'blur-rect' });
  parseArrowOverlayMock.mockReturnValue({ id: 'arrow', kind: 'arrow' });
  parseRectKindOverlayMock.mockReturnValueOnce({ id: 'rectangle', kind: 'rectangle' });
  parseRectKindOverlayMock.mockReturnValueOnce({ id: 'ellipse', kind: 'ellipse' });
  parseTextOverlayMock.mockReturnValue({ id: 'text', kind: 'text' });

  const overlays = parseCaptureOverlays([
    { autoSource: 'capture-target', id: 'focus', kind: 'focus-rect', rect: { x: 1, y: 2 } },
    { autoSource: 'capture-click', id: 'click', kind: 'click-ring', point: { x: 5, y: 6 } },
    {
      id: 'blur',
      kind: 'blur-rect',
      rect: { x: 9, y: 10 },
      blurSettings: { amount: 13, blurType: 'gaussian', showBorder: false },
    },
    { id: 'arrow', kind: 'arrow', start: { x: 10, y: 20 }, end: { x: 30, y: 40 } },
    { id: 'rectangle', kind: 'rectangle', rect: { x: 1, y: 2 } },
    { id: 'ellipse', kind: 'ellipse', rect: { x: 2, y: 3 } },
    { id: 'text', kind: 'text', point: { x: 12, y: 14 } },
  ]);

  expect(parseFocusRectOverlayMock).toHaveBeenCalledWith(expect.any(Object), 'capture-target');
  expect(parsePointKindOverlayMock).toHaveBeenCalledWith(expect.any(Object), 'capture-click');
  expect(parseBlurOverlayMock).toHaveBeenCalled();
  expect(parseArrowOverlayMock).toHaveBeenCalled();
  expect(parseRectKindOverlayMock).toHaveBeenCalledTimes(2);
  expect(parseTextOverlayMock).toHaveBeenCalled();
  expect(overlays.map((overlay) => overlay.kind)).toEqual([
    'focus-rect',
    'click-ring',
    'blur-rect',
    'arrow',
    'rectangle',
    'ellipse',
    'text',
  ]);
});

it('drops malformed and unknown overlay records before dispatch', async () => {
  const { parseCaptureOverlays } = await import('./overlays');

  expect(
    parseCaptureOverlays([{ id: 'broken' }, { id: 'unknown', kind: 'unknown' }, 'bad-record'])
  ).toEqual([]);
  expect(parseFocusRectOverlayMock).not.toHaveBeenCalled();
  expect(parsePointKindOverlayMock).not.toHaveBeenCalled();
  expect(parseBlurOverlayMock).not.toHaveBeenCalled();
  expect(parseArrowOverlayMock).not.toHaveBeenCalled();
  expect(parseRectKindOverlayMock).not.toHaveBeenCalled();
  expect(parseTextOverlayMock).not.toHaveBeenCalled();
});
