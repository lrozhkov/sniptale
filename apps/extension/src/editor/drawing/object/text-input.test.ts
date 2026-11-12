// @vitest-environment jsdom
import { Canvas, Textbox } from 'fabric';
import { expect, it } from 'vitest';
import { createEditorDrawingFabricObject } from './vector';

async function fixture(run: (textbox: Textbox, canvas: Canvas) => void | Promise<void>) {
  const element = document.createElement('canvas');
  document.body.append(element);
  const canvas = new Canvas(element);
  canvas.lowerCanvasEl.style.zIndex = '10';
  canvas.upperCanvasEl.style.zIndex = '10';
  const textbox = createEditorDrawingFabricObject(
    {
      id: 'native-input',
      kind: 'text',
      text: 'привет\n123',
      fontFamily: 'handwritten',
      fontSize: 24,
      color: '#111111',
      backgroundColor: '#ff7f50',
      bounds: { x: 40, y: 60, width: 300, height: 80 },
    },
    1
  );
  if (!(textbox instanceof Textbox)) throw new Error('Expected textbox');
  canvas.add(textbox);
  try {
    await run(textbox, canvas);
  } finally {
    await canvas.dispose();
    document.body.replaceChildren();
  }
}
it('uses the same Fabric textarea as visible browser input and restores native maps on exit', async () => {
  await fixture((textbox, canvas) => {
    const keys = textbox.keysMap;
    textbox.enterEditing();
    const input = textbox.hiddenTextarea!;
    expect(input.parentElement).toBe(canvas.wrapperEl);
    expect(input.style.opacity).toBe('1');
    expect(Number(input.style.zIndex)).toBeGreaterThan(Number(canvas.lowerCanvasEl.style.zIndex));
    expect(input.wrap).toBe('soft');
    expect(input.style.caretColor).toBe('rgb(37, 99, 235)');
    expect(input.style.fontSize).toBe('24px');
    expect(input.style.transform).toMatch(/^matrix\(/);
    expect(textbox.keysMap).toEqual({});
    input.setSelectionRange(7, 10);
    input.dispatchEvent(new Event('select'));
    expect(textbox.selectionStart).toBe(7);
    expect(textbox.selectionEnd).toBe(10);
    textbox.exitEditing();
    expect(textbox.keysMap).toBe(keys);
    expect(input.isConnected).toBe(false);
    textbox.enterEditing();
    expect(textbox.hiddenTextarea).not.toBe(input);
  });
});
it('keeps live input transform aligned with object rotation and viewport zoom', async () => {
  await fixture((textbox, canvas) => {
    textbox.set({ angle: 31 });
    canvas.setZoom(1.5);
    textbox.enterEditing();
    textbox.updateTextareaPosition();
    const matrix = textbox.hiddenTextarea!.style.transform;
    const values = matrix.slice(7, -1).split(',').map(Number);
    expect(values[0]).toBeCloseTo(Math.cos((31 * Math.PI) / 180) * 1.5, 6);
    const before = matrix;
    textbox.set({ left: textbox.left + 50 });
    textbox.updateTextareaPosition();
    expect(textbox.hiddenTextarea!.style.transform).not.toBe(before);
  });
});
it('keeps text in exported pixels while native input is active', async () => {
  await fixture((textbox) => {
    const before = textbox.toCanvasElement();
    textbox.enterEditing();
    const exported = textbox.toCanvasElement();
    const pixels = exported
      .getContext('2d')!
      .getImageData(0, 0, exported.width, exported.height).data;
    let ink = 0;
    for (let index = 0; index < pixels.length; index += 4)
      if (
        pixels[index]! < 100 &&
        pixels[index + 1]! < 100 &&
        pixels[index + 2]! < 100 &&
        pixels[index + 3]! > 100
      )
        ink++;
    expect(ink).toBeGreaterThan(10);
    expect(exported.width).toBeGreaterThan(0);
    expect(before.width).toBeGreaterThan(0);
    expect(textbox.hiddenTextarea!.style.opacity).toBe('1');
  });
});
it('commits through the existing editing lifecycle when native input loses focus', async () => {
  await fixture((textbox) => {
    textbox.enterEditing();
    const input = textbox.hiddenTextarea!;
    input.value = 'Accepted';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    expect(textbox.isEditing).toBe(false);
    expect(textbox.text).toBe('Accepted');
    expect(textbox.hiddenTextarea).toBeNull();
  });
});

it('keeps pasted plain text in the shared layout instead of importing Fabric inline styles', async () => {
  await fixture((textbox) => {
    textbox.enterEditing();
    const input = textbox.hiddenTextarea!;
    input.setSelectionRange(0, input.value.length);
    input.dispatchEvent(new Event('select'));
    textbox.copy();
    input.dispatchEvent(new Event('paste'));
    input.value = 'Pasted\nPlain';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    expect(textbox.text).toBe('Pasted\nPlain');
    expect(textbox.isEmptyStyles(0)).toBe(true);
    expect(textbox.isEmptyStyles(1)).toBe(true);
    expect(input.style.opacity).toBe('1');
  });
});

it('allows native selection without triggering the Canvas selection blocker', async () => {
  await fixture((textbox, canvas) => {
    textbox.enterEditing();
    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    canvas.wrapperEl.addEventListener('selectstart', (event) => event.preventDefault());
    textbox.hiddenTextarea!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

it('keeps the same canvas glyph pixels when entering native editing at fractional zoom', async () => {
  await fixture((textbox, canvas) => {
    canvas.setZoom(0.75);
    canvas.renderAll();
    const before = canvas.getContext().getImageData(0, 0, canvas.width, canvas.height).data;
    textbox.enterEditing();
    canvas.renderAll();
    const after = canvas.getContext().getImageData(0, 0, canvas.width, canvas.height).data;
    expect(after.reduce((count, value, index) => count + Number(value !== before[index]), 0)).toBe(
      0
    );
    expect(textbox.hiddenTextarea!.style.color).toBe('transparent');
  });
});
