import { describe, expect, it, vi } from 'vitest';

import { createLazyDefaultOwner } from './index';

describe('createLazyDefaultOwner', () => {
  it('stays lazy until first use and reuses the created owner', () => {
    const createOwner = vi.fn(() => ({ id: 'owner-1' }));
    const owner = createLazyDefaultOwner(createOwner);

    expect(owner.getOwnerIfCreated()).toBeNull();
    expect(createOwner).not.toHaveBeenCalled();

    const resolvedOwner = owner.getOwner();

    expect(resolvedOwner).toEqual({ id: 'owner-1' });
    expect(owner.getOwnerIfCreated()).toBe(resolvedOwner);
    expect(owner.getOwner()).toBe(resolvedOwner);
    expect(createOwner).toHaveBeenCalledTimes(1);
  });
});
