import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddFrameCommentIcon, FrameCommentIcon, FrameNumberIcon } from './icons';

describe('frame annotation iconography', () => {
  it.each([
    [FrameNumberIcon, 'tabler-icon-circle-number-1'],
    [FrameCommentIcon, 'tabler-icon-message-2'],
    [AddFrameCommentIcon, 'tabler-icon-message-2-plus'],
  ] as const)(
    'uses the requested glyph and inherits toolbar size, stroke and color',
    (Icon, className) => {
      const markup = renderToStaticMarkup(
        <Icon
          size={18}
          strokeWidth={1.75}
          className="neighbor"
          style={{ color: 'orange', display: 'block' }}
        />
      );
      expect(markup).toContain(className);
      expect(markup).toContain('width="18"');
      expect(markup).toContain('height="18"');
      expect(markup).toContain('stroke-width="1.75"');
      expect(markup).not.toContain('stroke-width="2"');
      expect(markup).toContain('stroke="currentColor"');
      expect(markup).toContain('neighbor');
      expect(markup).toContain('color:orange');
    }
  );
});
