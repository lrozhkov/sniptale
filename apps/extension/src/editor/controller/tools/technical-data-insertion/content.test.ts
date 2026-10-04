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

it('uses the available capture time instead of the insertion time', () => {
  const text = buildTechnicalDataText({
    kinds: ['date'],
    layout: 'column',
    locale: 'en',
    sourceTitle: '',
    sourceUrl: '',
    capturedAt: new Date('2020-03-04T10:20:00.000Z').getTime(),
  });

  expect(text).toContain('2020');
});
