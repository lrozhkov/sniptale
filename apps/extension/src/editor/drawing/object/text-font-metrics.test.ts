// @vitest-environment jsdom
import { Textbox } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorTextFontMetrics } from './text-font-metrics';
afterEach(() => {
  Reflect.deleteProperty(document, 'fonts');
});
it.each([16, 24, 37])('measures a font at its actual paint size %s', (size) => {
  const textbox = new Textbox('AV', { fontSize: size, fontFamily: 'A custom family' });
  const metrics = new EditorTextFontMetrics(textbox, vi.fn());
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = textbox._getFontDeclaration();
  const style = textbox.getCompleteStyleDeclaration(0, 0);
  const actual = metrics.measureChar('V', style, 'A', style);
  expect(actual.width).toBeCloseTo(context.measureText('V').width, 5);
  expect(actual.kernedWidth).toBeCloseTo(
    context.measureText('AV').width - context.measureText('A').width,
    5
  );
  metrics.dispose();
});
it('ignores stale font completion and completion after disposal', async () => {
  let finish!: (faces: unknown[]) => void;
  const promise = new Promise<unknown[]>((resolve) => {
    finish = resolve;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => false, load: () => promise },
  });
  const textbox = new Textbox('Text');
  const ready = vi.fn();
  const metrics = new EditorTextFontMetrics(textbox, ready);
  metrics.beginLayout();
  textbox.set({ fontFamily: 'Another family' });
  metrics.dispose();
  finish([{}]);
  await promise;
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
});
it('retains measurable text after an unavailable font request', async () => {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => false, load: () => Promise.reject(new Error('Unavailable')) },
  });
  const metrics = new EditorTextFontMetrics(new Textbox('Keep'), vi.fn());
  metrics.beginLayout();
  await Promise.resolve();
  await Promise.resolve();
  expect(metrics.measure('Keep').width).toBeGreaterThan(0);
  metrics.dispose();
});
