import { browserStorage } from './browser-storage';
import { resolveStoredBooleanFlag } from './ui-state-validation';

export async function loadStoredBooleanFlag(args: {
  failureMode: 'return-false' | 'throw';
  reportInvalid: (storageKey: string) => void;
  storageKey: string;
}): Promise<boolean> {
  try {
    const record = await browserStorage.local.get([args.storageKey]);
    return resolveStoredBooleanFlag(record, args.storageKey, args.reportInvalid);
  } catch (error) {
    if (args.failureMode === 'return-false') {
      return false;
    }
    throw error;
  }
}
