import { expect, it } from 'vitest';

import { createPopupExportRequestHandler } from './request-handler';
import { createPopupExportRequestHandler as createPopupExportRequestHandlerRuntime } from './request-handler/runtime';

it('keeps the request-handler facade thin', () => {
  expect(createPopupExportRequestHandler).toBe(createPopupExportRequestHandlerRuntime);
});
