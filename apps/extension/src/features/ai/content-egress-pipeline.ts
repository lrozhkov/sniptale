import type { LLMRequestOptimized } from '../../contracts/messaging/llm';
import { normalizeLlmPayloadForProvider, type AiPrivacyProof } from './privacy';
import { redactAiPayloadText } from '@sniptale/platform/security/ai-payload-privacy';
import { sanitizeLlmInput } from '@sniptale/platform/security/ai-payload-input';
import type {
  AiPayloadRiskClass,
  NormalizedLlmPrivacyPayload,
} from '@sniptale/platform/security/ai-dom-privacy/model';

export const CONTENT_AI_EGRESS_PIPELINE_STAGES = [
  'ingress-contract',
  'session-authorization',
  'egress-lease-binding',
  'payload-limits',
  'privacy-proof-verification',
  'privacy-normalization',
  'prompt-redaction',
  'transport-adapter',
  'response-parser',
] as const;

export const SCENARIO_EDITOR_AI_EGRESS_PIPELINE_STAGES = [
  'ingress-contract',
  'session-authorization',
  'egress-lease-binding',
  'payload-limits',
  'scenario-text-redaction',
  'transport-adapter',
  'response-parser',
] as const;

export const SCENARIO_EDITOR_AI_PIPELINE_DIVERGENCE = {
  acceptedReason:
    'Scenario/editor AI uses project JSON and user-provided attachments, not content DOM extraction.',
  requiredGuards: [
    'egress-lease-binding',
    'payload-limits',
    'scenario-text-redaction',
    'response-parser',
  ],
} as const;

type ContentAiEgressInput = {
  jsonData?: string | undefined;
  markdownData?: string | undefined;
  privacyProof?: AiPrivacyProof | undefined;
  prompt: string;
};

type ContentAiProviderEgress =
  | {
      payloadKind: 'json';
      request: LLMRequestOptimized & { jsonData: string };
      riskClass: AiPayloadRiskClass;
    }
  | {
      payloadKind: 'markdown';
      request: LLMRequestOptimized & { markdownData: string };
      riskClass: AiPayloadRiskClass;
    };

function normalizeContentAiPayload(
  input: ContentAiEgressInput
): Promise<NormalizedLlmPrivacyPayload> {
  return normalizeLlmPayloadForProvider({
    payload: {
      jsonData: input.jsonData,
      markdownData: input.markdownData,
    },
    privacyProof: input.privacyProof,
  });
}

function requireSanitizedString(value: string | undefined, label: string): string {
  if (value === undefined) {
    throw new Error(`Sanitized ${label} payload is missing`);
  }
  return value;
}

export async function prepareProviderContentAiEgress(
  input: ContentAiEgressInput
): Promise<ContentAiProviderEgress> {
  const normalizedPayload = await normalizeContentAiPayload(input);
  if (normalizedPayload.jsonData) {
    const request = sanitizeLlmInput({
      prompt: input.prompt,
      jsonData: normalizedPayload.jsonData,
    });
    return {
      payloadKind: 'json',
      request: {
        ...request,
        jsonData: requireSanitizedString(request.jsonData, 'JSON'),
      },
      riskClass: normalizedPayload.riskClass,
    };
  }
  if (normalizedPayload.markdownData) {
    const request = sanitizeLlmInput({
      prompt: input.prompt,
      markdownData: normalizedPayload.markdownData,
    });
    return {
      payloadKind: 'markdown',
      request: {
        ...request,
        markdownData: requireSanitizedString(request.markdownData, 'markdown'),
      },
      riskClass: normalizedPayload.riskClass,
    };
  }
  throw new Error('Neither jsonData nor markdownData provided');
}

export async function prepareChromeContentAiJsonEgress(input: {
  jsonData: string;
  privacyProof: AiPrivacyProof;
  prompt: string;
}): Promise<{ jsonData: string; prompt: string; riskClass: AiPayloadRiskClass }> {
  const normalizedPayload = await normalizeContentAiPayload({
    jsonData: input.jsonData,
    privacyProof: input.privacyProof,
    prompt: input.prompt,
  });
  if (!normalizedPayload.jsonData) {
    throw new Error('Chrome AI payload was removed by privacy normalization');
  }

  return {
    jsonData: normalizedPayload.jsonData,
    prompt: redactAiPayloadText(input.prompt),
    riskClass: normalizedPayload.riskClass,
  };
}
