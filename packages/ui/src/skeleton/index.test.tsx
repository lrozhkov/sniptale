import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './index';

function renderSkeleton(shape?: 'line' | 'block' | 'circle') {
  const shapeProps = shape === undefined ? {} : { shape };

  return renderToStaticMarkup(
    <Skeleton {...shapeProps} className="custom-skeleton" data-testid="skeleton" />
  );
}

describe('shared ui skeleton', () => {
  it('renders the expected shape classes for supported variants', () => {
    expect(renderSkeleton('line')).toContain('rounded-full');
    expect(renderSkeleton('circle')).toContain('rounded-full');
    expect(renderSkeleton('block')).toContain('rounded-[12px]');
  });

  it('keeps the default rounded shape for missing or impossible runtime values', () => {
    expect(renderSkeleton(undefined)).toContain('rounded-full');
    expect(renderSkeleton('triangle' as never)).toContain('rounded-full');
  });
});
