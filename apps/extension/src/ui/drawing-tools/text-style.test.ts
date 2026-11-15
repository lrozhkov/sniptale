import { expect, it } from 'vitest';
import { resolveDrawingTextInkLayout } from '../../features/drawing/public';
import {
  resolveDrawingTextInputBox,
  resolveDrawingTextLayoutStyle,
  resolveDrawingTextTypographyStyle,
} from './text-style';

it('keeps native input content width equal to the renderer wrap column for any overhang', () => {
  const layout = resolveDrawingTextInkLayout({
    text: 'Custom font',
    fontSize: 24,
    wrapWidth: 300,
    autoWidth: true,
    measure: (text) => ({
      width: text.length * 8,
      actualBoundingBoxLeft: 20,
      actualBoundingBoxRight: text.length * 8 + 25,
      actualBoundingBoxAscent: 60,
      actualBoundingBoxDescent: 30,
      fontBoundingBoxAscent: 24,
      fontBoundingBoxDescent: 6,
    }),
  });
  const box = resolveDrawingTextInputBox(layout);
  const padding = box.padding.split(' ').map(parseFloat);
  expect(box.width - padding[1]! - padding[3]!).toBe(layout.logicalWidth - 12);
  expect(box.left + padding[3]!).toBe(layout.originX);
  expect(
    box.top +
      padding[0]! +
      (layout.lineHeight - layout.fontAscent - layout.fontDescent) / 2 +
      layout.fontAscent
  ).toBe(layout.firstBaseline);
  expect(box.left).toBeLessThan(layout.originX - layout.inkLeftBearing);
  expect(box.top).toBeLessThan(layout.firstBaseline - layout.inkAscent);
  expect(layout.firstBaseline - layout.inkAscent).toBeGreaterThanOrEqual(6);
  expect(box.left + box.width).toBeGreaterThan(layout.originX + layout.logicalWidth - 12);
  expect(resolveDrawingTextLayoutStyle(layout).width).toBe(`${box.width}px`);
});
it('isolates typography from host inheritance and accepts an arbitrary family', () => {
  expect(
    resolveDrawingTextTypographyStyle({
      fontFamily: 'A user uploaded family',
      fontSize: 37,
      color: '#123456',
    })
  ).toMatchObject({
    fontFamily: 'A user uploaded family',
    fontSize: '37px',
    fontWeight: 400,
    lineHeight: '46.25px',
    letterSpacing: 'normal',
    wordSpacing: 'normal',
    textTransform: 'none',
    userSelect: 'text',
  });
});
