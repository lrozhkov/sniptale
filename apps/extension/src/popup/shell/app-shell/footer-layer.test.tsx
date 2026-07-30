// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const popupFooterMock = vi.hoisted(() =>
  vi.fn((_props: unknown) => <div data-ui="popup.footer" />)
);

vi.mock('../navigation/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navigation/actions')>()),
  openDesignSystem: vi.fn(),
  openGithubRepository: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('../footer', () => ({
  default: (props: unknown) => {
    return popupFooterMock(props);
  },
}));

import { FooterLayer } from './footer-layer';

describe('FooterLayer', () => {
  it('renders the footer without the retired applied-styles entrypoint', () => {
    const markup = renderToStaticMarkup(<FooterLayer />);
    expect(markup).toContain('popup.footer');
    expect(popupFooterMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ onOpenAppliedStyles: expect.anything() })
    );
  });
});
