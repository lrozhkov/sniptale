// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CanvasInsertPreviewOverlay } from './insert-preview';

it('renders shared canvas insert preview chrome for valid frames', () => {
  const markup = renderToStaticMarkup(
    <CanvasInsertPreviewOverlay
      dataUi="test.insert-preview"
      frame={{ height: 40, width: 80, x: 12, y: 16 }}
    />
  );

  expect(markup).toContain('data-ui="test.insert-preview"');
  expect(markup).toContain('border-[var(--sniptale-color-border-accent-strong)]');
  expect(markup).toContain('height:40px');
  expect(markup).toContain('left:12px');
});

it('skips tiny preview frames before a real drag gesture exists', () => {
  const markup = renderToStaticMarkup(
    <CanvasInsertPreviewOverlay frame={{ height: 1, width: 40, x: 0, y: 0 }} />
  );

  expect(markup).toBe('');
});
