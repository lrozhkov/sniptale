// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { copySelectionMask, createMaskedClipboardBitmap } from './mask';
import { mapMaskBoundsToScene } from './scene-bounds';

it('keeps clipboard mask scene-bounds mapping in the scene-bounds owner', () => {
  const bitmap = document.createElement('canvas');
  bitmap.width = 10;
  bitmap.height = 8;

  expect(
    mapMaskBoundsToScene(
      {
        bitmap,
        sceneBounds: { height: 80, left: 100, top: 200, width: 100 },
      },
      { height: 2, left: 2, top: 3, width: 4 }
    )
  ).toEqual({ height: 20, left: 120, top: 230, width: 40 });
});

it('keeps mask copying inside the clipboard mask owner', () => {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 3;
  maskCanvas.height = 2;

  const copied = copySelectionMask({ maskCanvas } as never);

  expect(copied).not.toBe(maskCanvas);
  expect(copied.width).toBe(3);
  expect(copied.height).toBe(2);
});

it('rejects empty mask payloads in the clipboard mask owner', () => {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = 3;
  maskCanvas.height = 2;
  const bitmap = document.createElement('canvas');
  bitmap.width = 3;
  bitmap.height = 2;

  expect(
    createMaskedClipboardBitmap(
      {
        maskCanvas,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      },
      { bitmap, sceneBounds: { height: 20, left: 0, top: 0, width: 30 } }
    )
  ).toBeNull();
});
