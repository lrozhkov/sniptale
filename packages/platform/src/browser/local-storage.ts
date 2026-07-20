export function readLocalStorageItem(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage.getItem(key);
}
