import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FrameAnnotationResizeHandleLayer } from './resize-handles';

describe('frame annotation resize handles', () => {
  it('centers handles on the middle of an outward stroke', () => {
    const html = renderToStaticMarkup(
      <FrameAnnotationResizeHandleLayer
        directions={['nw']}
        frameId="frame-1"
        frameRect={{ x: 10, y: 20, width: 100, height: 80 }}
        handleSize={10}
        onResizeStart={vi.fn()}
        strokeWidth={4}
      />
    );

    expect(html).toContain('left:3px');
    expect(html).toContain('top:13px');
  });

  it.each([{ visualScale: 4 }, { visualScale: 0.5 }, { visualScale: 0.2 }])(
    'keeps handle centers anchored at visual scale $visualScale',
    (sample) => {
      const html = renderToStaticMarkup(
        <FrameAnnotationResizeHandleLayer
          directions={['nw']}
          frameId="frame-zoom"
          frameRect={{ x: 10, y: 20, width: 100, height: 80 }}
          handleSize={10}
          onResizeStart={vi.fn()}
          strokeWidth={4}
          visualScale={sample.visualScale}
        />
      );

      const strokeOutset = (4 * sample.visualScale) / 2;
      expect(html).toContain(`left:${10 - strokeOutset - 5}px`);
      expect(html).toContain(`top:${20 - strokeOutset - 5}px`);
    }
  );
});
