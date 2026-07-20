import { createNativeAppRuntimeService } from './service';
import type { NativeAppRuntimeService } from './service-types';

let defaultService: NativeAppRuntimeService | null = null;

export function getNativeAppRuntimeService(): NativeAppRuntimeService {
  defaultService ??= createNativeAppRuntimeService();
  return defaultService;
}
