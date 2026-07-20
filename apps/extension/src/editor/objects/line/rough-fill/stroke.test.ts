import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { jitterLineRoughFillPoint, strokeLine } from './stroke';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

describe('line rough fill stroke owner', () => {
  it('applies deterministic jitter for the same index', () => {
    expect(jitterLineRoughFillPoint(10, settings, 4)).toBe(
      jitterLineRoughFillPoint(10, settings, 4)
    );
    expect(jitterLineRoughFillPoint(10, settings, 4)).not.toBe(
      jitterLineRoughFillPoint(10, settings, 5)
    );
  });

  it('draws bowed quadratic strokes with jittered endpoints', () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
    };

    strokeLine(context as never, settings, 0, 0, 20, 0, 1);

    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledOnce();
    expect(context.quadraticCurveTo).toHaveBeenCalledOnce();
    expect(context.stroke).toHaveBeenCalledOnce();
  });
});
