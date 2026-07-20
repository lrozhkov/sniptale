import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { drawLineRoughFillPattern } from './drawers';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rotate: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };
}

describe('line rough fill drawers owner', () => {
  it('renders solid fills directly without pattern transforms', () => {
    const context = createContext();

    drawLineRoughFillPattern(context as never, { ...settings, roughFillStyle: 'solid' }, 32);

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(context.translate).not.toHaveBeenCalled();
  });

  it('routes hatch, cross hatch, dots, dashed, and zigzag styles through expected primitives', () => {
    const hachure = createContext();
    drawLineRoughFillPattern(hachure as never, { ...settings, roughFillStyle: 'hachure' }, 32);
    expect(hachure.quadraticCurveTo).toHaveBeenCalled();

    const crossHatch = createContext();
    drawLineRoughFillPattern(
      crossHatch as never,
      { ...settings, roughFillStyle: 'cross-hatch' },
      32
    );
    expect(crossHatch.rotate).toHaveBeenCalledWith(Math.PI / 2);

    const dots = createContext();
    drawLineRoughFillPattern(dots as never, { ...settings, roughFillStyle: 'dots' }, 32);
    expect(dots.arc).toHaveBeenCalled();

    const dashed = createContext();
    drawLineRoughFillPattern(dashed as never, { ...settings, roughFillStyle: 'dashed' }, 32);
    expect(dashed.stroke).toHaveBeenCalled();

    const zigzag = createContext();
    drawLineRoughFillPattern(zigzag as never, { ...settings, roughFillStyle: 'zigzag-line' }, 32);
    expect(zigzag.quadraticCurveTo).toHaveBeenCalled();
  });
});
