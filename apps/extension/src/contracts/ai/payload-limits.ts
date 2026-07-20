import type { ProcessWithLLMMessage } from '../messaging/llm';
import type { ProcessScenarioEditorWithLLMMessage } from './scenario';
import {
  CONTENT_AI_PAYLOAD_LIMITS,
  SCENARIO_EDITOR_AI_PAYLOAD_LIMITS,
} from '@sniptale/runtime-contracts/ai/payload-policy';
import {
  estimateBase64DecodedBytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';

type ContentAiPayload = Pick<ProcessWithLLMMessage, 'jsonData' | 'markdownData' | 'prompt'>;
type ScenarioEditorAiPayload = Pick<
  ProcessScenarioEditorWithLLMMessage,
  | 'attachments'
  | 'contractVersion'
  | 'instruction'
  | 'projectOutlineJson'
  | 'projectSnapshotJson'
  | 'selectedSlideCodeJson'
  | 'toolManifestJson'
>;

const ALLOWED_SCENARIO_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set(
  SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.allowedAttachmentMimeTypes
);

const textEncoder = new TextEncoder();

function assertTextLimit(label: string, value: string | undefined, limit: number): void {
  if (value !== undefined && value.length > limit) {
    throw new Error(`${label} exceeds ${limit} characters`);
  }
}

function assertDecodedBytesLimit(label: string, value: string | undefined, limit: number): void {
  if (value !== undefined && textEncoder.encode(value).byteLength > limit) {
    throw new Error(`${label} exceeds ${limit} decoded bytes`);
  }
}

function parseScenarioAttachmentDataUrl(
  value: string
): { mimeType: string; payload: string } | null {
  const commaIndex = value.indexOf(',');
  if (!value.startsWith('data:') || commaIndex < 0) {
    return null;
  }

  const metadata = value.slice('data:'.length, commaIndex);
  const payload = value.slice(commaIndex + 1);
  const parts = metadata.split(';').map((part) => part.trim().toLowerCase());
  const mimeType = parts[0] ?? '';
  return parts.includes('base64') && mimeType ? { mimeType, payload } : null;
}

function assertScenarioAttachmentDataUrl(attachment: { dataUrl: string; mimeType: string }): void {
  const parsed = parseScenarioAttachmentDataUrl(attachment.dataUrl);
  const normalizedMimeType = attachment.mimeType.trim().toLowerCase();
  if (
    !parsed ||
    parsed.mimeType !== normalizedMimeType ||
    !ALLOWED_SCENARIO_ATTACHMENT_MIME_TYPES.has(parsed.mimeType) ||
    !isCanonicalBase64(parsed.payload) ||
    !isImageDataUrl(attachment.dataUrl)
  ) {
    throw new Error('attachments[].dataUrl must be a raster image data URL');
  }
}

function assertDataUrlDecodedBytesLimit(label: string, value: string, limit: number): void {
  const payload = parseScenarioAttachmentDataUrl(value)?.payload ?? '';
  if (estimateBase64DecodedBytes(payload) > limit) {
    throw new Error(`${label} exceeds ${limit} decoded bytes`);
  }
}

export function assertContentAiPayloadLimits(message: ContentAiPayload): void {
  assertTextLimit('prompt', message.prompt, CONTENT_AI_PAYLOAD_LIMITS.maxPromptChars);
  assertTextLimit('jsonData', message.jsonData, CONTENT_AI_PAYLOAD_LIMITS.maxTextFieldChars);
  assertTextLimit(
    'markdownData',
    message.markdownData,
    CONTENT_AI_PAYLOAD_LIMITS.maxTextFieldChars
  );
  assertDecodedBytesLimit(
    'prompt',
    message.prompt,
    CONTENT_AI_PAYLOAD_LIMITS.maxPromptDecodedBytes
  );
  assertDecodedBytesLimit(
    'jsonData',
    message.jsonData,
    CONTENT_AI_PAYLOAD_LIMITS.maxTextFieldDecodedBytes
  );
  assertDecodedBytesLimit(
    'markdownData',
    message.markdownData,
    CONTENT_AI_PAYLOAD_LIMITS.maxTextFieldDecodedBytes
  );
}

export function assertProcessWithLlmPayloadLimits(message: ProcessWithLLMMessage): void {
  assertContentAiPayloadLimits(message);
}

export function assertScenarioEditorAiPayloadLimits(message: ScenarioEditorAiPayload): void {
  assertScenarioTextCharLimits(message);
  assertScenarioTextDecodedByteLimits(message);
  assertScenarioAttachmentLimits(message.attachments);
}

function assertScenarioTextCharLimits(message: ScenarioEditorAiPayload): void {
  assertTextLimit(
    'instruction',
    message.instruction,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionChars
  );
  assertTextLimit(
    'projectSnapshotJson',
    message.projectSnapshotJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxProjectSnapshotJsonChars
  );
  assertTextLimit(
    'projectOutlineJson',
    message.projectOutlineJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldChars
  );
  assertTextLimit(
    'selectedSlideCodeJson',
    message.selectedSlideCodeJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldChars
  );
  assertTextLimit(
    'toolManifestJson',
    message.toolManifestJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldChars
  );
}

function assertScenarioTextDecodedByteLimits(message: ScenarioEditorAiPayload): void {
  assertDecodedBytesLimit(
    'instruction',
    message.instruction,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxInstructionDecodedBytes
  );
  assertDecodedBytesLimit(
    'projectSnapshotJson',
    message.projectSnapshotJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxProjectSnapshotJsonDecodedBytes
  );
  assertDecodedBytesLimit(
    'projectOutlineJson',
    message.projectOutlineJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldDecodedBytes
  );
  assertDecodedBytesLimit(
    'selectedSlideCodeJson',
    message.selectedSlideCodeJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldDecodedBytes
  );
  assertDecodedBytesLimit(
    'toolManifestJson',
    message.toolManifestJson,
    SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxJsonFieldDecodedBytes
  );
}

export function assertScenarioEditorLlmPayloadLimits(
  message: ProcessScenarioEditorWithLLMMessage
): void {
  assertScenarioEditorAiPayloadLimits(message);
}

function assertScenarioAttachmentLimits(
  attachments: ProcessScenarioEditorWithLLMMessage['attachments']
): void {
  if (attachments.length > SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentCount) {
    throw new Error(
      `attachments exceeds ${SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentCount} items`
    );
  }
  let attachmentChars = 0;
  let attachmentDecodedBytes = 0;
  for (const attachment of attachments) {
    assertScenarioAttachmentDataUrl(attachment);
    assertTextLimit(
      'attachments[].dataUrl',
      attachment.dataUrl,
      SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentDataUrlChars
    );
    assertDataUrlDecodedBytesLimit(
      'attachments[].dataUrl',
      attachment.dataUrl,
      SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentDataUrlDecodedBytes
    );
    attachmentChars += attachment.dataUrl.length;
    attachmentDecodedBytes += estimateBase64DecodedBytes(
      parseScenarioAttachmentDataUrl(attachment.dataUrl)?.payload ?? ''
    );
  }

  if (attachmentChars > SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentTotalChars) {
    throw new Error(
      `attachments total exceeds ${SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentTotalChars} characters`
    );
  }
  if (attachmentDecodedBytes > SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentTotalDecodedBytes) {
    throw new Error(
      `attachments total exceeds ${SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentTotalDecodedBytes} decoded bytes`
    );
  }
}
