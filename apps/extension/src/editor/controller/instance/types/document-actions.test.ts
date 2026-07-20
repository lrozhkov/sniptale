import { describe, expect, it } from 'vitest';

import type { EditorControllerInstanceDocumentActions } from './document-actions';

type Assert<T extends true> = T;
type HasDocumentLifecycle = Assert<
  EditorControllerInstanceDocumentActions extends {
    closeDocument(): void;
    undo(): Promise<void>;
  }
    ? true
    : false
>;

describe('controller instance document action type role', () => {
  it('keeps document lifecycle actions in the document role', () => {
    const role: HasDocumentLifecycle = true;

    expect(role).toBe(true);
  });
});
