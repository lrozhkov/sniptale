import { describe, expect, it } from 'vitest';

import { readEditorAssetId } from '@sniptale/runtime-contracts/editor/session';

describe('editor aggregate ids', () => {
  it('reads only the stable asset id from query strings', () => {
    expect(readEditorAssetId('?session=session-1&assetId=asset-1')).toBe('asset-1');
    expect(readEditorAssetId('?session=session-1')).toBeNull();
  });
});
