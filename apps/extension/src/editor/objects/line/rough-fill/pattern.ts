import { Pattern } from 'fabric';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import { hexToRgba } from '../../../document/model';

import { drawLineRoughFillPattern } from './drawers';

const PATTERN_SIZE = 512;

function createCanvas(size: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function createLineRoughFillPattern(settings: EditorLineSettings): Pattern | string {
  const size = PATTERN_SIZE;
  const canvas = createCanvas(size);
  const context = canvas?.getContext('2d');
  const fill = hexToRgba(settings.roughFillColor, settings.roughFillOpacity);
  if (!canvas || !context) {
    return fill;
  }

  context.strokeStyle = fill;
  context.fillStyle = fill;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(1, settings.roughFillWeight);
  drawLineRoughFillPattern(context, settings, size);

  return new Pattern({
    repeat: 'repeat',
    source: canvas,
  });
}
