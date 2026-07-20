import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { ExpiredOverlay } from './index';

describe('expired overlay', () => {
  it('renders translated fallback content with the default data-ui marker', () => {
    const markup = renderToStaticMarkup(<ExpiredOverlay />);

    expect(markup).toContain('data-ui="shared.ui.expired-overlay"');
    expect(markup).toContain('popup.common.expiredTitle');
    expect(markup).toContain('popup.common.expiredDescription');
  });

  it('renders caller-provided title, message, and data-ui props', () => {
    const markup = renderToStaticMarkup(
      <ExpiredOverlay dataUi="custom.expired" title="Expired" message="This session is over." />
    );

    expect(markup).toContain('data-ui="custom.expired"');
    expect(markup).toContain('Expired');
    expect(markup).toContain('This session is over.');
  });
});
