import { describe, expect, it } from 'vitest';

import type { EditorControllerInstanceSelectionActions } from './selection-actions';

type Assert<T extends true> = T;
type HasSelectionAuthority = Assert<
  EditorControllerInstanceSelectionActions extends {
    clearSelection(): void;
    duplicateSelection(): Promise<void>;
  }
    ? true
    : false
>;

describe('controller instance selection action type role', () => {
  it('keeps selection commands in the selection role', () => {
    const role: HasSelectionAuthority = true;

    expect(role).toBe(true);
  });
});
