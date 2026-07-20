// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AiSparkIcon, ContentStrokeIcon, PopoverCheckIcon } from './icons';

describe('content shared icons', () => {
  it('renders the popover check icon with the shared check class', () => {
    const markup = renderToStaticMarkup(<PopoverCheckIcon />);

    expect(markup).toContain('sniptale-popover-check');
    expect(markup).toContain('polyline');
  });

  it('renders the shared AI spark icon with caller-provided class names', () => {
    const markup = renderToStaticMarkup(<AiSparkIcon className="sniptale-ai-icon" size={20} />);

    expect(markup).toContain('sniptale-ai-icon');
    expect(markup).toContain('width="20"');
    expect(markup).toContain('scale(-1, 1)');
  });

  it('renders a generic stroke icon shell for small action icons', () => {
    const markup = renderToStaticMarkup(
      <ContentStrokeIcon className="sniptale-action-icon" size={13} strokeWidth={2}>
        <path d="M4 4h16" />
      </ContentStrokeIcon>
    );

    expect(markup).toContain('sniptale-action-icon');
    expect(markup).toContain('width="13"');
    expect(markup).toContain('M4 4h16');
  });
});
