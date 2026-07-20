import { describe, expect, it } from 'vitest';

import { readEditorAssetId, readEditorSessionId } from '@sniptale/runtime-contracts/editor/session';

describe('editor session ids', () => {
  it('reads session and asset ids from query strings', () => {
    expect(readEditorSessionId('?session=session-1&assetId=asset-1')).toBe('session-1');
    expect(readEditorAssetId('?session=session-1&assetId=asset-1')).toBe('asset-1');
    expect(readEditorSessionId('?assetId=asset-1')).toBeNull();
    expect(readEditorAssetId('?session=session-1')).toBeNull();
  });
});
