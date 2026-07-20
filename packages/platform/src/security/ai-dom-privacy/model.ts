import type {
  AiCaptureMode,
  AiPayloadRiskClass,
  AiPrivacyProof,
} from '@sniptale/runtime-contracts/protocol/ai-privacy';

export const AI_PRIVACY_PROOF_TTL_MS = 2 * 60 * 1000;
export const MAX_DOM_NODE_ID_LENGTH = 200;
export const MAX_DOM_NODE_TEXT_LENGTH = 20_000;
export const MAX_DOM_NODE_SELECTOR_LENGTH = 500;
export const REDACTED_TEXT = '[redacted]';

export const UNSAFE_LOCATOR_PATTERNS = [
  /\btype\s*=\s*["']?(?:password|hidden)["']?/iu,
  /\bname\s*=\s*["']?[^"'\]]*(?:token|otp|auth|password|secret|csrf|xsrf)[^"'\]]*/iu,
  /\bautocomplete\s*=\s*["']?(?:one-time-code|current-password|new-password)["']?/iu,
  /\brole\s*=\s*["']?(?:textbox|searchbox)["']?/iu,
  /contenteditable/iu,
  /data-(?:virtual-iframe|iframe-source|token|auth|session|cookie)/iu,
  /shadow[-\s_]?root|shadowroot|::shadow/iu,
  /iframe/iu,
] as const;

export const UNSAFE_TEXT_PATTERNS = [
  /<script\b/iu,
  /\bon[a-z]+\s*=/iu,
  /\bdata:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/iu,
  /\b(?:cookie|set-cookie|authorization|proxy-authorization)\s*[:=]/iu,
] as const;

export type { AiCaptureMode, AiPayloadRiskClass, AiPrivacyProof };

type AiPrivacyDomNode = {
  id: string;
  selector?: string | undefined;
  text: string;
};

export type LlmPrivacyPayload = {
  data?: readonly AiPrivacyDomNode[] | undefined;
  jsonData?: string | undefined;
  markdownData?: string | undefined;
};

export type NormalizedLlmPrivacyPayload = {
  data?: AiPrivacyDomNode[] | undefined;
  jsonData?: string | undefined;
  markdownData?: string | undefined;
  riskClass: AiPayloadRiskClass;
};

export class AiPrivacyBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiPrivacyBoundaryError';
  }
}

export function limitString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function hasUnsafePattern(value: string | undefined, patterns: readonly RegExp[]): boolean {
  return Boolean(value && patterns.some((pattern) => pattern.test(value)));
}
