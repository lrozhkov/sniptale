import type { ScenarioAIAttachment } from '../../../contracts/ai/scenario';
import { createAiPayloadHash, type AiPrivacyProof, type LlmPrivacyPayload } from '../privacy';
import { createSha256Digest } from '@sniptale/platform/security/digest';
import { AiEgressAuthorityError } from './errors';
import { canonicalizeScenarioJsonObjectField } from './scenario-canonical';
import { stableStringify } from './stable-json';
import {
  AI_EGRESS_AUTHORITY_CONTRACT_VERSION,
  type AiEgressAuthority,
  type ContentAiEgressAuthority,
  type ScenarioAiAttachmentSummary,
  type ScenarioEditorAiEgressAuthority,
  type ScenarioEditorCanonicalEgressPayload,
  type ScenarioEditorEgressPayloadInput,
} from './types';

export { AiEgressAuthorityError } from './errors';
export { aiEgressAuthoritySchema } from '../../../contracts/ai/egress-authority';
export {
  AI_EGRESS_AUTHORITY_CONTRACT_VERSION,
  type AiEgressAuthority,
  type ContentAiEgressAuthority,
  type ScenarioAiAttachmentSummary,
  type ScenarioAiAttachmentSummaryItem,
  type ScenarioEditorAiEgressAuthority,
  type ScenarioEditorCanonicalEgressPayload,
  type ScenarioEditorEgressPayloadInput,
} from './types';

export async function createContentAiEgressAuthority(args: {
  payload: LlmPrivacyPayload;
  privacyProof: AiPrivacyProof;
}): Promise<ContentAiEgressAuthority> {
  const payloadHash = await createAiPayloadHash(args.payload);
  if (args.privacyProof.payloadHash !== payloadHash) {
    throw new AiEgressAuthorityError('AI privacy proof payload binding mismatch');
  }

  return {
    captureMode: args.privacyProof.captureMode,
    contractVersion: AI_EGRESS_AUTHORITY_CONTRACT_VERSION,
    payloadHash,
    purpose: 'content-ai-pick',
    riskClass: args.privacyProof.riskClass,
  };
}

export function canonicalizeScenarioEditorEgressPayload(
  input: ScenarioEditorEgressPayloadInput
): ScenarioEditorCanonicalEgressPayload {
  return {
    attachments: input.attachments,
    contractVersion: 3,
    projectOutlineJson: canonicalizeScenarioJsonObjectField(
      'projectOutlineJson',
      input.projectOutlineJson ?? '{}'
    ),
    projectSnapshotJson: canonicalizeScenarioJsonObjectField(
      'projectSnapshotJson',
      input.projectSnapshotJson
    ),
    selectedSlideCodeJson: canonicalizeScenarioJsonObjectField(
      'selectedSlideCodeJson',
      input.selectedSlideCodeJson ?? '{}'
    ),
    toolManifestJson: canonicalizeScenarioJsonObjectField(
      'toolManifestJson',
      input.toolManifestJson ?? '{}'
    ),
  };
}

export async function createScenarioEditorEgressAuthority(
  input: ScenarioEditorEgressPayloadInput
): Promise<ScenarioEditorAiEgressAuthority> {
  return createScenarioEditorEgressAuthorityFromCanonical(
    canonicalizeScenarioEditorEgressPayload(input)
  );
}

export async function createScenarioEditorEgressAuthorityFromCanonical(
  canonicalPayload: ScenarioEditorCanonicalEgressPayload
): Promise<ScenarioEditorAiEgressAuthority> {
  const attachmentSummary = await createScenarioAttachmentSummary(canonicalPayload.attachments);
  return {
    attachmentSummary,
    contractVersion: AI_EGRESS_AUTHORITY_CONTRACT_VERSION,
    payloadHash: await createAiEgressPayloadHash({
      attachmentSummary,
      contractVersion: canonicalPayload.contractVersion,
      projectOutlineJson: canonicalPayload.projectOutlineJson,
      projectSnapshotJson: canonicalPayload.projectSnapshotJson,
      selectedSlideCodeJson: canonicalPayload.selectedSlideCodeJson,
      toolManifestJson: canonicalPayload.toolManifestJson,
    }),
    purpose: 'scenario-editor',
    scenarioContractVersion: canonicalPayload.contractVersion,
  };
}

export function createAiEgressAuthorityKey(authority: AiEgressAuthority): string {
  return stableStringify(authority);
}

async function createScenarioAttachmentSummary(
  attachments: readonly ScenarioAIAttachment[]
): Promise<ScenarioAiAttachmentSummary> {
  const items = await Promise.all(
    attachments.map(async (attachment) => ({
      dataUrlHash: await createAiEgressPayloadHash(attachment.dataUrl),
      dataUrlLength: attachment.dataUrl.length,
      filename: attachment.filename,
      mimeType: attachment.mimeType.trim().toLowerCase(),
      stepId: attachment.stepId,
      stepNumber: attachment.stepNumber,
    }))
  );

  return {
    count: items.length,
    items,
    totalDataUrlLength: items.reduce((total, item) => total + item.dataUrlLength, 0),
  };
}

function createAiEgressPayloadHash(value: unknown): Promise<string> {
  return createSha256Digest(stableStringify(value));
}
