import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { LlmSessionPurpose } from './llm';

export type AISecretUnlockStatus =
  | 'pending'
  | 'submitted'
  | 'completed'
  | 'expired'
  | 'restart-required'
  | 'failed';
export type AISecretUnlockReason = 'ai-secrets-locked';

type AISecretUnlockMessageBase<TOperation extends AISecretUnlockOperation> = {
  operation: TOperation;
  type: typeof MessageType.AI_SECRET_UNLOCK;
};

export type AISecretUnlockOperation = 'start' | 'submit' | 'status' | 'cancel';

export type AISecretUnlockMessage =
  | (AISecretUnlockMessageBase<'start'> & { purpose: LlmSessionPurpose })
  | (AISecretUnlockMessageBase<'submit'> & { requestId: string; passphrase: string })
  | (AISecretUnlockMessageBase<'status'> & { requestId: string })
  | (AISecretUnlockMessageBase<'cancel'> & { requestId: string });

export interface AISecretUnlockResponse {
  error?: string | undefined;
  reason?: AISecretUnlockReason | undefined;
  requestId?: string | undefined;
  status?: AISecretUnlockStatus | undefined;
  success: boolean;
}
