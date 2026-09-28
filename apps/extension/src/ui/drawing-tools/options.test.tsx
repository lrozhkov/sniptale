import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DrawingBlurStrengthOptions, DrawingShapeOptions, DrawingWidthOptions } from './options';

describe('shared drawing option controls', () => {
  it('offers only the canonical quick shapes', () => {
    const markup = renderToStaticMarkup(
      <DrawingShapeOptions value="rectangle" onChange={vi.fn()} />
    );

    expect(markup).toContain('shape.kind-rectangle');
    expect(markup).toContain('shape.kind-ellipse');
    expect(markup).toContain('shape.kind-triangle');
    expect(markup).not.toContain('parallelogram');
  });

  it('renders distinct square pencil width controls', () => {
    const markup = renderToStaticMarkup(
      <DrawingWidthOptions tool="pencil" value={4} values={[2, 4, 8, 16]} onChange={vi.fn()} />
    );

    expect(markup.match(/drawing-width-preview/g)).toHaveLength(4);
    expect(markup).toContain('aspect-square');
    expect(markup).toContain('width:3px');
    expect(markup).toContain('width:12px');
  });

  it('shows three icon-only blur previews with distinct strengths and named hints', () => {
    const markup = renderToStaticMarkup(
      <DrawingBlurStrengthOptions value={20} onChange={vi.fn()} />
    );

    expect(markup.match(/data-ui="drawing-blur-preview"/g)).toHaveLength(3);
    expect(markup).toContain('filter:blur(0.35px)');
    expect(markup).toContain('filter:blur(1.2px)');
    expect(markup).toContain('filter:blur(2.6px)');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('title="');
    expect(markup).toContain('2px');
    expect(markup).toContain('6px');
    expect(markup).toContain('20px');
    expect(markup.replace(/<[^>]*>/g, '')).toBe('');
  });
});
