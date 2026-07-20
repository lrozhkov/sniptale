export function createLazyDefaultOwner<T>(createOwner: () => T): {
  getOwner: () => T;
  getOwnerIfCreated: () => T | null;
} {
  let owner: T | null = null;

  return {
    getOwner: () => {
      owner ??= createOwner();
      return owner;
    },
    getOwnerIfCreated: () => owner,
  };
}
