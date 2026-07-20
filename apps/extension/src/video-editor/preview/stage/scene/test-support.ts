import { vi } from 'vitest';

import type { PreviewEffectRuntimeFeedback } from '../types';

export function createPreviewEffectRuntimeFeedbackTestStub(): PreviewEffectRuntimeFeedback {
  return {
    failed: false,
    onFailure: vi.fn(),
    onRecovery: vi.fn(),
    onRetry: vi.fn(),
    retryVersion: 0,
  };
}
