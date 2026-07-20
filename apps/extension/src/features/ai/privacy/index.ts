import type { DOMNode } from '../../../contracts/messaging/llm';
import { createSha256Digest } from '@sniptale/platform/security/digest';
import {
  isSensitiveAiFieldName,
  redactAiPayloadText,
} from '@sniptale/platform/security/ai-payload-privacy';
import {
  AI_PRIVACY_PROOF_TTL_MS,
  AiPrivacyBoundaryError,
  MAX_DOM_NODE_ID_LENGTH,
  MAX_DOM_NODE_SELECTOR_LENGTH,
  MAX_DOM_NODE_TEXT_LENGTH,
  REDACTED_TEXT,
  UNSAFE_LOCATOR_PATTERNS,
  UNSAFE_TEXT_PATTERNS,
  hasUnsafePattern,
  limitString,
  type AiCaptureMode,
  type AiPayloadRiskClass,
  type AiPrivacyProof,
  type LlmPrivacyPayload,
  type NormalizedLlmPrivacyPayload,
} from '@sniptale/platform/security/ai-dom-privacy/model';

export {
  type AiPrivacyProof,
  type LlmPrivacyPayload,
} from '@sniptale/platform/security/ai-dom-privacy/model';

function serializePayloadForHash(payload: LlmPrivacyPayload): string {
  return JSON.stringify({
    data: payload.data?.map((node) => ({
      id: node.id,
      selector: node.selector ?? null,
      text: node.text,
    })),
    jsonData: payload.jsonData ?? null,
    markdownData: payload.markdownData ?? null,
  });
}

export function createAiPayloadHash(payload: LlmPrivacyPayload): Promise<string> {
  return createSha256Digest(serializePayloadForHash(payload));
}

export async function createAiPrivacyProof(args: {
  captureMode: AiCaptureMode;
  payload: LlmPrivacyPayload;
  riskClass?: AiPayloadRiskClass | undefined;
  sourceFrameId?: number | undefined;
  sourceOrigin?: string | null | undefined;
  sourceTabId?: number | undefined;
  userInitiatedAiExtraction: boolean;
}): Promise<AiPrivacyProof> {
  return {
    captureMode: args.captureMode,
    createdAtEpochMs: Date.now(),
    generation: globalThis.crypto?.randomUUID?.() ?? (await createSha256Digest(`${Date.now()}:ai`)),
    payloadHash: await createAiPayloadHash(args.payload),
    riskClass: args.riskClass ?? classifyAiExtractionRisk(args.payload),
    ...(args.sourceFrameId === undefined ? {} : { sourceFrameId: args.sourceFrameId }),
    ...(args.sourceOrigin === undefined ? {} : { sourceOrigin: args.sourceOrigin }),
    ...(args.sourceTabId === undefined ? {} : { sourceTabId: args.sourceTabId }),
    userInitiatedAiExtraction: args.userInitiatedAiExtraction,
  };
}

function resolveDomNodeRisk(node: DOMNode): AiPayloadRiskClass {
  if (
    isSensitiveAiFieldName(node.id) ||
    hasUnsafePattern(node.selector, UNSAFE_LOCATOR_PATTERNS) ||
    hasUnsafePattern(node.text, UNSAFE_TEXT_PATTERNS)
  ) {
    return 'sensitive_dom';
  }

  if (/\b(?:input|textarea|form|field|контакт|email|phone|телефон)\b/iu.test(node.id)) {
    return 'form_text';
  }

  return 'safe_text';
}

function mergeRiskClass(current: AiPayloadRiskClass, next: AiPayloadRiskClass): AiPayloadRiskClass {
  if (current === 'sensitive_dom' || next === 'sensitive_dom') {
    return 'sensitive_dom';
  }
  if (current === 'form_text' || next === 'form_text') {
    return 'form_text';
  }
  return 'safe_text';
}

export function classifyAiExtractionRisk(payload: LlmPrivacyPayload): AiPayloadRiskClass {
  let riskClass: AiPayloadRiskClass = 'safe_text';

  payload.data?.forEach((node) => {
    riskClass = mergeRiskClass(riskClass, resolveDomNodeRisk(node));
  });

  for (const value of [payload.jsonData, payload.markdownData]) {
    if (!value) {
      continue;
    }
    if (
      hasUnsafePattern(value, UNSAFE_LOCATOR_PATTERNS) ||
      hasUnsafePattern(value, UNSAFE_TEXT_PATTERNS)
    ) {
      riskClass = mergeRiskClass(riskClass, 'sensitive_dom');
    }
  }

  return riskClass;
}

export function sanitizeDomNodeForLlm(node: DOMNode): DOMNode | null {
  if (resolveDomNodeRisk(node) === 'sensitive_dom') {
    return null;
  }

  return {
    id: limitString(redactAiPayloadText(node.id), MAX_DOM_NODE_ID_LENGTH),
    text: limitString(redactAiPayloadText(node.text), MAX_DOM_NODE_TEXT_LENGTH),
    ...(node.selector === undefined
      ? {}
      : {
          selector: limitString(redactAiPayloadText(node.selector), MAX_DOM_NODE_SELECTOR_LENGTH),
        }),
  };
}

function normalizeDomNodes(nodes: readonly DOMNode[] | undefined): DOMNode[] | undefined {
  if (nodes === undefined) {
    return undefined;
  }

  const sanitizedNodes = nodes.flatMap((node) => {
    const sanitized = sanitizeDomNodeForLlm(node);
    return sanitized === null ? [] : [sanitized];
  });
  return sanitizedNodes.length > 0 ? sanitizedNodes : undefined;
}

function normalizeTextPayload(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (hasUnsafePattern(value, UNSAFE_TEXT_PATTERNS)) {
    return REDACTED_TEXT;
  }
  return redactAiPayloadText(value);
}

function assertRiskAllowed(proof: AiPrivacyProof, riskClass: AiPayloadRiskClass): void {
  if (riskClass === 'sensitive_dom' || proof.riskClass === 'sensitive_dom') {
    throw new AiPrivacyBoundaryError('Sensitive DOM is blocked from LLM payloads');
  }

  if (
    riskClass === 'form_text' &&
    proof.captureMode !== 'explicit_form_text' &&
    proof.captureMode !== 'full_tree_explicit'
  ) {
    throw new AiPrivacyBoundaryError('Form text requires explicit AI extraction mode');
  }
}

function assertProofFresh(proof: AiPrivacyProof, nowEpochMs: number): void {
  if (!proof.userInitiatedAiExtraction) {
    throw new AiPrivacyBoundaryError('AI payload requires explicit user initiated extraction');
  }
  if (proof.createdAtEpochMs + AI_PRIVACY_PROOF_TTL_MS <= nowEpochMs) {
    throw new AiPrivacyBoundaryError('AI privacy proof is stale');
  }
}

export async function normalizeLlmPayloadForProvider(args: {
  payload: LlmPrivacyPayload;
  privacyProof: AiPrivacyProof | undefined;
  nowEpochMs?: number | undefined;
}): Promise<NormalizedLlmPrivacyPayload> {
  const hasPagePayload =
    args.payload.data !== undefined ||
    args.payload.jsonData !== undefined ||
    args.payload.markdownData !== undefined;
  if (!hasPagePayload) {
    throw new AiPrivacyBoundaryError('AI request is missing page-derived payload');
  }

  const proof = args.privacyProof;
  if (!proof) {
    throw new AiPrivacyBoundaryError('AI privacy proof is required');
  }

  assertProofFresh(proof, args.nowEpochMs ?? Date.now());
  if (proof.payloadHash !== (await createAiPayloadHash(args.payload))) {
    throw new AiPrivacyBoundaryError('AI privacy proof payload binding mismatch');
  }

  const riskClass = classifyAiExtractionRisk(args.payload);
  assertRiskAllowed(proof, riskClass);

  const normalizedData = normalizeDomNodes(args.payload.data);
  const normalizedJsonData = normalizeTextPayload(args.payload.jsonData);
  const normalizedMarkdownData = normalizeTextPayload(args.payload.markdownData);
  const normalized: NormalizedLlmPrivacyPayload = {
    riskClass,
    ...(normalizedData === undefined ? {} : { data: normalizedData }),
    ...(normalizedJsonData === undefined ? {} : { jsonData: normalizedJsonData }),
    ...(normalizedMarkdownData === undefined ? {} : { markdownData: normalizedMarkdownData }),
  };

  if (
    normalized.data === undefined &&
    normalized.jsonData === undefined &&
    normalized.markdownData === undefined
  ) {
    throw new AiPrivacyBoundaryError('AI payload was removed by privacy normalization');
  }

  return normalized;
}
