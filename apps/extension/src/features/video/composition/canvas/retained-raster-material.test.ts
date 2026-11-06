import { expect, it, vi } from 'vitest';
import { createRetainedRasterMaterialOwner } from './retained-raster-material';

function fixture() {
  const owner = createRetainedRasterMaterialOwner<object>();
  const identity = {};
  const allocate = vi.fn(() => ({ value: {}, release: vi.fn() }));
  return { owner, identity, allocate };
}

it('shares unchanged pixels and their revision while readers borrow them', () => {
  const f = fixture();
  const first = f.owner.borrow(f.identity, 'pixels', f.allocate);
  const second = f.owner.borrow(f.identity, 'pixels', f.allocate);
  expect(second.value).toBe(first.value);
  expect(second.revision).toBe(first.revision);
  expect(f.allocate).toHaveBeenCalledOnce();
  first.release();
  second.release();
  expect(f.allocate.mock.results[0]!.value!.release).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(f.allocate.mock.results[0]!.value!.release).toHaveBeenCalledOnce();
});

it('keeps borrowed pixels stable and releases a temporary replacement after its last reader', () => {
  const f = fixture();
  const first = f.owner.borrow(f.identity, 'first', f.allocate);
  const temporary = f.owner.borrow(f.identity, 'second', f.allocate);
  expect(temporary.value).not.toBe(first.value);
  expect(temporary.revision).toBeUndefined();
  expect(f.allocate.mock.results[0]!.value!.release).not.toHaveBeenCalled();
  temporary.release();
  temporary.release();
  expect(f.allocate.mock.results[1]!.value!.release).toHaveBeenCalledOnce();
  const retained = f.owner.borrow(f.identity, 'first', f.allocate);
  expect(retained.value).toBe(first.value);
  first.release();
  retained.release();
  f.owner.dispose();
});

it('retires idle pixels only after replacement allocation and painting succeed', () => {
  const f = fixture();
  const first = f.owner.borrow(f.identity, 'first', f.allocate);
  first.release();
  expect(() =>
    f.owner.borrow(f.identity, 'second', () => {
      throw new Error('paint failed');
    })
  ).toThrow('paint failed');
  const retained = f.owner.borrow(f.identity, 'first', f.allocate);
  expect(retained.value).toBe(first.value);
  retained.release();
  const second = f.owner.borrow(f.identity, 'second', f.allocate);
  expect(second.revision).not.toBe(first.revision);
  expect(f.allocate.mock.results[0]!.value!.release).toHaveBeenCalledOnce();
  second.release();
  f.owner.dispose();
});

it('waits for borrowed readers after disposal and refuses new work', () => {
  const f = fixture();
  const first = f.owner.borrow(f.identity, 'pixels', f.allocate);
  const second = f.owner.borrow(f.identity, 'pixels', f.allocate);
  f.owner.dispose();
  f.owner.dispose();
  first.release();
  expect(f.allocate.mock.results[0]!.value!.release).not.toHaveBeenCalled();
  second.release();
  second.release();
  expect(f.allocate.mock.results[0]!.value!.release).toHaveBeenCalledOnce();
  expect(() => f.owner.borrow(f.identity, 'pixels', f.allocate)).toThrow('disposed');
});

it('invalidates the same pooled value across pixel keys and owner lifetimes', () => {
  const value = {};
  const allocate = () => ({ value, release: vi.fn() });
  const identity = {};
  const firstOwner = createRetainedRasterMaterialOwner<object>();
  const first = firstOwner.borrow(identity, 'first', allocate);
  first.release();
  const second = firstOwner.borrow(identity, 'second', allocate);
  expect(second.value).toBe(first.value);
  expect(second.revision).not.toBe(first.revision);
  second.release();
  firstOwner.dispose();
  const nextOwner = createRetainedRasterMaterialOwner<object>();
  const next = nextOwner.borrow(identity, 'second', allocate);
  expect(next.revision).not.toBe(second.revision);
  next.release();
  nextOwner.dispose();
});

it('does not share pixels across allocation identities', () => {
  const f = fixture();
  const first = f.owner.borrow(f.identity, 'pixels', f.allocate);
  first.release();
  const second = f.owner.borrow({}, 'pixels', f.allocate);
  expect(second.value).not.toBe(first.value);
  expect(second.revision).not.toBe(first.revision);
  second.release();
  f.owner.dispose();
});

it('releases completed allocation when disposal occurs inside its allocator', () => {
  const f = fixture();
  const release = vi.fn();
  expect(() =>
    f.owner.borrow(f.identity, 'pixels', () => {
      f.owner.dispose();
      return { value: {}, release };
    })
  ).toThrow('disposed');
  expect(release).toHaveBeenCalledOnce();
});
