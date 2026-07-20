import { describe, expect, it } from 'vitest';
import { createScenarioSlide } from '../../../../../features/scenario/project/v3';
import { renderScenarioDeckHtmlNotes } from './notes';
import { renderScenarioDeckHtmlSlide } from './slide';

describe('scenario deck HTML slide rendering', () => {
  it('renders escaped notes only when enabled and present', () => {
    const slide = createScenarioSlide({ notes: '<note>' });

    expect(renderScenarioDeckHtmlNotes({ includeNotes: true, slide })).toContain('&lt;note&gt;');
    expect(renderScenarioDeckHtmlNotes({ includeNotes: false, slide })).toBe('');
    expect(
      renderScenarioDeckHtmlNotes({ includeNotes: true, slide: { ...slide, notes: ' ' } })
    ).toBe('');
  });

  it('falls back to slide index when title is empty', () => {
    const slide = createScenarioSlide({ id: 'slide-1', title: '' });
    const html = renderScenarioDeckHtmlSlide({
      options: {
        assetMode: 'embed',
        format: 'html',
        includeMissingPlaceholders: true,
        includeNotes: false,
        includeSourceJson: false,
      },
      rendered: { index: 2, slide, svg: '<svg />' },
    });

    expect(html).toContain('Slide 3');
    expect(html).toContain('data-slide-id="slide-1"');
  });
});
