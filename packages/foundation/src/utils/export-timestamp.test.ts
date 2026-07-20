import { expect, it } from 'vitest';

import { getMoscowFilenameTimestamp } from './export-timestamp';

it('formats filename timestamps in Moscow time', () => {
  expect(getMoscowFilenameTimestamp(new Date('2026-03-22T10:11:12.000Z'))).toBe(
    '2026-03-22_13-11-12'
  );
});
