import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AIEditChange } from '@sniptale/runtime-contracts/dom-tree';
import type { AiEgressAuthority } from '../ai/egress-authority';
import type { AiPrivacyProof } from '@sniptale/runtime-contracts/protocol/ai-privacy';

export interface DOMNode {
  id: string;
  text: string;
  selector?: string | undefined;
}

export interface LLMResponse {
  data?: DOMNode[];
  cleanedResponse?: string;
  error?: string;
  rawResponse?: string;
}

export interface ProcessWithLLMMessage {
  type: typeof MessageType.PROCESS_WITH_LLM;
  llmSessionToken: string;
  prompt: string;
  privacyProof: AiPrivacyProof;
  jsonData?: string | undefined;
  markdownData?: string | undefined;
  modelId?: string | null | undefined;
}

export interface ProcessWithLLMResponse {
  success: boolean;
  data?: DOMNode[] | undefined;
  changes?: AIEditChange[] | undefined;
  error?: string | undefined;
  parseErrors?: string[] | undefined;
}

export type LlmSessionPurpose = 'content-ai-pick' | 'scenario-editor';

export interface RequestLlmSessionMessage {
  egressAuthority: AiEgressAuthority;
  type: typeof MessageType.REQUEST_LLM_SESSION;
  purpose: LlmSessionPurpose;
}

export interface RequestLlmSessionResponse {
  error?: string | undefined;
  reason?: 'ai-secrets-locked' | undefined;
  success: boolean;
  token?: string | undefined;
}

interface AIRequestJSON {
  i: string;
  f: Array<{
    id: string;
    n: string;
    c: string;
    new: string;
  }>;
  t: Array<{
    ttl: string;
    r: Array<{
      id: string;
      d: Record<string, string>;
      new: Record<string, string>;
    }>;
  }>;
}

export type AIResponseJSON = AIRequestJSON;

export interface LLMRequestOptimized {
  prompt: string;
  markdownData?: string;
  jsonData?: string;
}
