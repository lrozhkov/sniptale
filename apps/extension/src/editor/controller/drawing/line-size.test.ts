import { describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createLineObject } from '../../objects/line';
import { isCompletedDrawSessionTooSmall } from './';

describe('line draw session size', () => {
  it('uses line length instead of bounding box thickness', () => {
    const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).line;
    const line = createLineObject({
      id: 'line-1',
      labelIndex: 1,
      points: [
        { x: 0, y: 0 },
        { x: 48, y: 0 },
      ],
      settings,
    });
    const tinyLine = createLineObject({
      id: 'line-2',
      labelIndex: 2,
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      settings,
    });

    expect(isCompletedDrawSessionTooSmall({ object: line, tool: 'line' } as never, 8)).toBe(false);
    expect(isCompletedDrawSessionTooSmall({ object: tinyLine, tool: 'line' } as never, 8)).toBe(
      true
    );
    expect(
      isCompletedDrawSessionTooSmall(
        {
          object: { getBoundingRect: () => ({ height: 20, width: 20 }) },
          tool: 'line',
        } as never,
        8
      )
    ).toBe(false);
  });
});
