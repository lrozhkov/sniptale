import { describe, expect, it } from 'vitest';

import {
  PRODUCT_BRAND_NAME,
  RECORDING_EXPORT_FILENAME_PREFIX,
  SESSION_EXPORT_FILENAME,
} from './index';

describe('shared branding constants', () => {
  it('keeps recording export prefixes aligned with the canonical product brand', () => {
    expect(RECORDING_EXPORT_FILENAME_PREFIX).toBe(PRODUCT_BRAND_NAME);
    expect(SESSION_EXPORT_FILENAME).toBe('sniptale-session.json');
  });
});
