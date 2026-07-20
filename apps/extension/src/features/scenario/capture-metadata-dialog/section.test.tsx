// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioMetadataSectionView } from './section';

describe('ScenarioMetadataSectionView', () => {
  it('renders the canonical section shell for metadata items', () => {
    const markup = renderToStaticMarkup(
      <ScenarioMetadataSectionView
        title="Page"
        items={[
          { label: 'URL', value: 'https://example.test' },
          { label: 'Viewport', value: '0, 0 • 1280 × 720' },
        ]}
      />
    );

    expect(markup).toContain('Page');
    expect(markup).toContain('URL');
    expect(markup).toContain('https://example.test');
    expect(markup).toContain('sniptale-color-border-soft');
    expect(markup).toContain('sniptale-color-text-primary');
  });
});
