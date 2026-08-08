import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignReviewModeIcon, FeedbackCollectionIcon } from './icons';

describe('design review iconography', () => {
  it.each([
    [DesignReviewModeIcon, 'lucide-monitor-check'],
    [FeedbackCollectionIcon, 'lucide-messages-square'],
  ] as const)('keeps mode and feedback collection glyphs distinct', (Icon, className) => {
    expect(renderToStaticMarkup(<Icon />)).toContain(className);
  });
});
