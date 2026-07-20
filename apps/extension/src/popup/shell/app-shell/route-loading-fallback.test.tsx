// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PopupRouteLoadingFallback } from './route-loading-fallback';

describe('PopupRouteLoadingFallback', () => {
  it('renders the loading skeleton layout', () => {
    const markup = renderToStaticMarkup(<PopupRouteLoadingFallback />);

    expect(markup).toContain('popup.app.route-loading');
    expect(markup).toContain('h-full');
    expect(markup).toContain('rounded-[16px]');
  });
});
