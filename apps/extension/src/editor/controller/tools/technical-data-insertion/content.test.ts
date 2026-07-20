import { expect, it } from 'vitest';

import { buildTechnicalDataText } from './content';

it('builds ordered column and row technical data text', () => {
  expect(
    buildTechnicalDataText({
      kinds: ['url'],
      layout: 'column',
      locale: 'en',
      sourceTitle: '',
      sourceUrl: '',
    })
  ).toContain('https://example.com');

  expect(
    buildTechnicalDataText({
      kinds: ['browser', 'url'],
      layout: 'row',
      locale: 'en',
      sourceTitle: 'Page',
      sourceUrl: 'https://example.com',
    })
  ).toContain(' · ');
});
