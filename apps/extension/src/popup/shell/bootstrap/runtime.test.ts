import { expect, it } from 'vitest';

import { popupBootstrapTransport } from './runtime';

it('creates the popup bootstrap runtime transport at the local wiring seam', () => {
  expect(typeof popupBootstrapTransport.sendRuntimeMessage).toBe('function');
  expect(typeof popupBootstrapTransport.sendTabMessage).toBe('function');
});
