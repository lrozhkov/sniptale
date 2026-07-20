// @vitest-environment jsdom
import { Pattern } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createLineRoughFillPattern } from './pattern';

const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;

describe('line rough fill pattern owner', () => {
  it('creates repeat Fabric patterns with configured color and stroke state', () => {
    const pattern = createLineRoughFillPattern({
      ...settings,
      roughFillColor: '#123456',
      roughFillOpacity: 0.5,
      roughFillStyle: 'solid',
      roughFillWeight: 3,
    });

    expect(pattern).toBeInstanceOf(Pattern);
    const source = (pattern as Pattern).source as HTMLCanvasElement;
    expect(source.width).toBe(512);
    expect(source.height).toBe(512);
  });

  it('falls back to rgba fill when document canvas is unavailable', () => {
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: vi.fn(() => null),
      height: 0,
      width: 0,
    } as never);

    expect(
      createLineRoughFillPattern({
        ...settings,
        roughFillColor: '#123456',
        roughFillOpacity: 0.5,
      })
    ).toBe('rgba(18, 52, 86, 0.5)');
    createElement.mockRestore();
  });
});
