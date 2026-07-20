import { z } from 'zod';

import type { ScenarioAIAttachment } from './scenario';
import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';
import {
  AI_CAPTURE_MODES,
  AI_PAYLOAD_RISK_CLASSES,
  type AiCaptureMode,
  type AiPayloadRiskClass,
} from '@sniptale/runtime-contracts/protocol/ai-privacy';

export const AI_EGRESS_AUTHORITY_CONTRACT_VERSION = 1;

export type ContentAiEgressAuthority = {
  captureMode: AiCaptureMode;
  contractVersion: typeof AI_EGRESS_AUTHORITY_CONTRACT_VERSION;
  payloadHash: string;
  purpose: 'content-ai-pick';
  riskClass: AiPayloadRiskClass;
};

export type ScenarioAiAttachmentSummaryItem = {
  dataUrlHash: string;
  dataUrlLength: number;
  filename: string;
  mimeType: string;
  stepId: string;
  stepNumber: number;
};

export type ScenarioAiAttachmentSummary = {
  count: number;
  items: ScenarioAiAttachmentSummaryItem[];
  totalDataUrlLength: number;
};

export type ScenarioEditorAiEgressAuthority = {
  attachmentSummary: ScenarioAiAttachmentSummary;
  contractVersion: typeof AI_EGRESS_AUTHORITY_CONTRACT_VERSION;
  payloadHash: string;
  purpose: 'scenario-editor';
  scenarioContractVersion: 3;
};

export type AiEgressAuthority = ContentAiEgressAuthority | ScenarioEditorAiEgressAuthority;

export type ScenarioEditorCanonicalEgressPayload = {
  attachments: ScenarioAIAttachment[];
  contractVersion: 3;
  projectOutlineJson: string;
  projectSnapshotJson: string;
  selectedSlideCodeJson: string;
  toolManifestJson: string;
};

export type ScenarioEditorEgressPayloadInput = {
  attachments: ScenarioAIAttachment[];
  contractVersion: 3;
  projectOutlineJson?: string | undefined;
  projectSnapshotJson: string;
  selectedSlideCodeJson?: string | undefined;
  toolManifestJson?: string | undefined;
};

const scenarioAiAttachmentSummaryItemSchema = z
  .object({
    dataUrlHash: z.string().regex(SHA256_DIGEST_PATTERN),
    dataUrlLength: z.number().int().nonnegative(),
    filename: z.string(),
    mimeType: z.string(),
    stepId: z.string(),
    stepNumber: z.number().int().positive(),
  })
  .strict();

const scenarioAiAttachmentSummarySchema = z
  .object({
    count: z.number().int().nonnegative(),
    items: z.array(scenarioAiAttachmentSummaryItemSchema),
    totalDataUrlLength: z.number().int().nonnegative(),
  })
  .strict();

export const aiEgressAuthoritySchema: z.ZodType<AiEgressAuthority> = z.discriminatedUnion(
  'purpose',
  [
    z
      .object({
        captureMode: z.enum(AI_CAPTURE_MODES),
        contractVersion: z.literal(AI_EGRESS_AUTHORITY_CONTRACT_VERSION),
        payloadHash: z.string().regex(SHA256_DIGEST_PATTERN),
        purpose: z.literal('content-ai-pick'),
        riskClass: z.enum(AI_PAYLOAD_RISK_CLASSES),
      })
      .strict(),
    z
      .object({
        attachmentSummary: scenarioAiAttachmentSummarySchema,
        contractVersion: z.literal(AI_EGRESS_AUTHORITY_CONTRACT_VERSION),
        payloadHash: z.string().regex(SHA256_DIGEST_PATTERN),
        purpose: z.literal('scenario-editor'),
        scenarioContractVersion: z.literal(3),
      })
      .strict(),
  ]
);
