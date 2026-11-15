// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { Textbox } from 'fabric';
import { attachEditorTextboxLifecycle } from './textbox-lifecycle';

it('commits non-empty drawing text and removes empty text through one lifecycle', () => {
  const textbox = new Textbox('');
  const onEmpty = vi.fn();
  const onCommit = vi.fn();
  attachEditorTextboxLifecycle(textbox, { onEmpty, onCommit });
  textbox.sniptaleDrawingTextAutoWidth = true;
  textbox.fire('editing:exited');
  expect(onEmpty).toHaveBeenCalledOnce();
  expect(onCommit).not.toHaveBeenCalled();

  textbox.text = 'Shared drawing text';
  textbox.fire('editing:exited');
  expect(onCommit).toHaveBeenCalledOnce();
  expect(onCommit).toHaveBeenCalledWith(textbox);
  expect(textbox.sniptaleDrawingTextAutoWidth).toBe(true);
});

it('restores fitted pixels, coordinates and automatic wrapping after edit-cancel-re-edit', async () => {
  const { Canvas } = await import('fabric');
  const { createEditorDrawingFabricObject } = await import('../../../drawing/object/vector');
  const { beginEditorTextboxEditing, cancelEditorTextboxEditing } =
    await import('./textbox-lifecycle');
  const canvas = new Canvas(document.createElement('canvas'));
  try {
    const textbox = createEditorDrawingFabricObject(
      {
        id: 'cancel-fitted',
        kind: 'text',
        text: 'Original  \n\n',
        fontFamily: 'sans',
        fontSize: 24,
        color: '#111111',
        backgroundColor: '#f97316',
        bounds: { x: 20, y: 30, width: 400, height: 60 },
      },
      1
    );
    if (!(textbox instanceof Textbox)) throw new Error('Expected textbox');
    // Node Canvas needs an installed family instead of the browser font stack.
    textbox.set({ fontFamily: 'sans-serif' });
    canvas.add(textbox);
    const onCommit = vi.fn();
    attachEditorTextboxLifecycle(textbox, { onEmpty: vi.fn(), onCommit });
    const snapshot = {
      left: textbox.left,
      top: textbox.top,
      width: textbox.width,
      height: textbox.height,
      text: textbox.text,
      metadata: textbox.sniptaleDrawingJson,
      maxWidth: textbox.sniptaleDrawingTextMaxWidth,
    };
    const pixels = () => {
      const image = textbox.toCanvasElement();
      return Buffer.from(
        image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data
      );
    };
    const before = pixels();
    beginEditorTextboxEditing(textbox);
    textbox.enterEditing();
    textbox.set({ text: 'A longer replacement' });
    textbox.hiddenTextarea!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
    );
    expect(textbox.isEditing).toBe(true);
    cancelEditorTextboxEditing(textbox);
    expect(textbox.sniptaleDrawingTextAutoWidth).toBe(true);
    expect(textbox.sniptaleDrawingTextMaxWidth).toBe(snapshot.maxWidth);
    expect(textbox.text).toBe(snapshot.text);
    expect(textbox.sniptaleDrawingJson).toBe(snapshot.metadata);
    expect(textbox.left).toBeCloseTo(snapshot.left, 4);
    expect(textbox.top).toBeCloseTo(snapshot.top, 4);
    expect(textbox.width).toBeCloseTo(snapshot.width, 4);
    expect(textbox.height).toBeCloseTo(snapshot.height, 4);
    expect(pixels().equals(before)).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
    textbox.enterEditing();
    textbox.set({ text: 'A longer replacement' });
    expect(textbox.width).toBeGreaterThan(snapshot.width);
    expect(textbox._textLines).toHaveLength(1);
    cancelEditorTextboxEditing(textbox);
  } finally {
    await canvas.dispose();
  }
});

it('restores a grouped text scene origin after parent layout changes during a cancelled edit', async () => {
  const { Group, Point, Rect } = await import('fabric');
  const { beginEditorTextboxEditing, cancelEditorTextboxEditing } =
    await import('./textbox-lifecycle');
  const text = new Textbox('Original  text\n', { left: 20, top: 30, width: 130, fontSize: 24 });
  text.sniptaleDrawingTextAutoWidth = false;
  text.sniptaleDrawingTextMaxWidth = 170;
  const peer = new Rect({ left: 200, top: 100, width: 30, height: 20 });
  const parent = new Group([text, peer], { angle: 30, scaleX: 2, scaleY: 2 });
  const onCommit = vi.fn();
  attachEditorTextboxLifecycle(text, { onEmpty: vi.fn(), onCommit });
  text.selectionStart = 2;
  text.selectionEnd = 8;
  const original = text.getXY();
  const width = text.width;
  beginEditorTextboxEditing(text);
  text.isEditing = true;
  text.set({ text: 'Changed text that changes the group layout', width: 260 });
  text.fire('changed');
  parent.triggerLayout();
  cancelEditorTextboxEditing(text);
  expect(text.text).toBe('Original  text\n');
  expect(text.getXY().distanceFrom(new Point(original.x, original.y))).toBeLessThan(0.001);
  expect(text.width).toBe(width);
  expect(text.selectionStart).toBe(2);
  expect(text.selectionEnd).toBe(8);
  expect(text.sniptaleDrawingTextAutoWidth).toBe(false);
  expect(text.sniptaleDrawingTextMaxWidth).toBe(170);
  expect(onCommit).not.toHaveBeenCalled();
});
