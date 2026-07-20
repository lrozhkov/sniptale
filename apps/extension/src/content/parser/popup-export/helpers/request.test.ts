import { expect, it } from 'vitest';

import { parsePopupExportRequest } from './request';
import { parsePopupExportRequest as parsePopupExportRequestImpl } from './request/parse';

it('keeps the request helper facade thin', () => {
  expect(parsePopupExportRequest).toBe(parsePopupExportRequestImpl);
});
