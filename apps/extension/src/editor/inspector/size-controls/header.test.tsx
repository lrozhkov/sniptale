import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SizeControlsHeader } from './header';

it('renders compact size headers with the compact sentence-case label typography', () => {
  const markup = renderToStaticMarkup(<SizeControlsHeader label="Размер" valueText="1280 x 720" />);

  expect(markup).not.toContain('uppercase');
  expect(markup).not.toContain('tracking-');
});

it('omits the value node when no value text is provided', () => {
  const markup = renderToStaticMarkup(<SizeControlsHeader label="Размер" />);

  expect(markup).toContain('Размер');
  expect(markup).not.toContain('1280 x 720');
});
