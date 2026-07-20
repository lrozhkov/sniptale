import { describe, expect, it } from 'vitest';

import { isCaptureActionTypeValue } from './action';

describe('capture action contract', () => {
  it.each(['download_default', 'ask_preset', 'ask_system', 'scenario', 'edit', 'copy'])(
    'accepts %s',
    (value) => {
      expect(isCaptureActionTypeValue(value)).toBe(true);
    }
  );

  it.each(['download-default', 'COPY', '', null, 1])('rejects unsupported value %j', (value) => {
    expect(isCaptureActionTypeValue(value)).toBe(false);
  });
});
