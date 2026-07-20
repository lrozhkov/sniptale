import { describe, expect, it, vi } from 'vitest';

import { createLazyContentDefaultOwner } from '.';

describe('createLazyContentDefaultOwner', () => {
  it('keeps the owner lazy and reuses the same instance after creation', () => {
    const owner = { id: 'owner-1' };
    const createOwner = vi.fn(() => owner);
    const accessors = createLazyContentDefaultOwner(createOwner);

    expect(accessors.getOwnerIfCreated()).toBeNull();
    expect(createOwner).not.toHaveBeenCalled();

    expect(accessors.getOwner()).toBe(owner);
    expect(accessors.getOwner()).toBe(owner);
    expect(accessors.getOwnerIfCreated()).toBe(owner);
    expect(createOwner).toHaveBeenCalledTimes(1);
  });
});
