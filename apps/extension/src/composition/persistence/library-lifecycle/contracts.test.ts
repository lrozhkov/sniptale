import { describe, expect, it } from 'vitest';
import {
  createLibraryLifecycle,
  DEFAULT_LOCAL_STORAGE_POLICY,
  getDraftRetentionMs,
  matchesLibraryLifecycleScope,
  parseLibraryLifecycle,
  promoteLibraryLifecycle,
  updateLibraryLifecycle,
} from '.';

describe('library lifecycle contracts', () => {
  it('creates, updates, and promotes a temporary lifecycle without changing identity', () => {
    const draft = createLibraryLifecycle('temporary', 100);
    expect(draft).toEqual({ savedAt: null, storageClass: 'temporary', updatedAt: 100 });
    expect(updateLibraryLifecycle(draft, 200)).toEqual({ ...draft, updatedAt: 200 });
    expect(promoteLibraryLifecycle(draft, 300)).toEqual({
      savedAt: 300,
      storageClass: 'library',
      updatedAt: 300,
    });
    const library = promoteLibraryLifecycle(draft, 300);
    expect(promoteLibraryLifecycle(library, 400)).toBe(library);
    expect(matchesLibraryLifecycleScope(library, 'all')).toBe(true);
    expect(matchesLibraryLifecycleScope(library, 'library')).toBe(true);
    expect(matchesLibraryLifecycleScope(library, 'temporary')).toBe(false);
  });

  it('normalizes legacy records as library and rejects malformed lifecycle values', () => {
    expect(parseLibraryLifecycle(undefined, { storageClass: 'library', updatedAt: 42 })).toEqual({
      savedAt: 42,
      storageClass: 'library',
      updatedAt: 42,
    });
    expect(parseLibraryLifecycle(undefined, { storageClass: 'temporary', updatedAt: 42 })).toEqual({
      savedAt: null,
      storageClass: 'temporary',
      updatedAt: 42,
    });
    expect(
      parseLibraryLifecycle(
        { storageClass: 'temporary' },
        { storageClass: 'library', updatedAt: 42 }
      )
    ).toBeNull();
  });

  it('uses separate ordinary and video retention and supports no expiration', () => {
    expect(getDraftRetentionMs(DEFAULT_LOCAL_STORAGE_POLICY, 'ordinary')).toBe(
      30 * 24 * 60 * 60 * 1000
    );
    expect(getDraftRetentionMs(DEFAULT_LOCAL_STORAGE_POLICY, 'video')).toBe(
      7 * 24 * 60 * 60 * 1000
    );
    expect(
      getDraftRetentionMs({ ...DEFAULT_LOCAL_STORAGE_POLICY, cleanupEnabled: false }, 'ordinary')
    ).toBeNull();
  });
});
