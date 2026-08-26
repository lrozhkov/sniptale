import { browserStorage } from '../infrastructure/browser-storage';

const LOCAL_FILE_ACCESS_OPT_IN_STORAGE_KEY = 'sniptale_page_access_local_file_opt_in';

export async function hasLocalFileAccessOptIn(): Promise<boolean> {
  const stored = await browserStorage.local.get([LOCAL_FILE_ACCESS_OPT_IN_STORAGE_KEY]);
  return stored[LOCAL_FILE_ACCESS_OPT_IN_STORAGE_KEY] === true;
}

export async function setLocalFileAccessOptIn(enabled: boolean): Promise<void> {
  await browserStorage.local.set({ [LOCAL_FILE_ACCESS_OPT_IN_STORAGE_KEY]: enabled });
}
