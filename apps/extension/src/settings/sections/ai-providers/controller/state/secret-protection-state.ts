import { useState } from 'react';

import type { AISecretProtectionStatusPayload } from '../../../../../contracts/messaging/ai-settings-runtime';

const DEFAULT_AI_SECRET_PROTECTION_STATUS: AISecretProtectionStatusPayload = {
  isEnabled: false,
  isUnlocked: true,
  mode: 'transparent',
};

export type AiSecretProtectionDataState = {
  secretProtectionStatus: AISecretProtectionStatusPayload;
  setSecretProtectionStatus: (value: AISecretProtectionStatusPayload) => void;
};

export function useAiSecretProtectionDataState(): AiSecretProtectionDataState {
  const [secretProtectionStatus, setSecretProtectionStatus] = useState(
    DEFAULT_AI_SECRET_PROTECTION_STATUS
  );

  return {
    secretProtectionStatus,
    setSecretProtectionStatus,
  };
}
