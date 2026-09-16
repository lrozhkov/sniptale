import { createScenarioAiManifest } from '@sniptale/runtime-contracts/scenario-ai-operations';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { SCENARIO_EDITOR_AI_PAYLOAD_LIMITS } from '@sniptale/runtime-contracts/ai/payload-policy';
import type { ScenarioAIAttachment } from '../../../contracts/ai/scenario';
import { assertScenarioEditorAiPayloadLimits } from '../../../contracts/ai/payload-limits';
import { getScenarioProjectEntry } from '../../../composition/persistence/scenario/projects';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import {
  selectGuideAiContent,
  prepareGuideAiProposal,
  type GuideAiScope,
} from '../../../features/scenario/project/public';
import {
  createScenarioEditorEgressAuthority,
  canonicalizeScenarioEditorEgressPayload,
} from '../../../features/ai/egress-authority';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';
import { requestLlmSessionToken } from '../../../workflows/ai-session/llm-session';
import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { renderGuideImageFrame } from './image-frame';

export class GuideAiStaleError extends Error {
  constructor() {
    super('AI proposal basis is no longer current.');
    this.name = 'GuideAiStaleError';
  }
}

/** Reads sanitized selector metadata through the existing background-owned settings query. */
export async function loadGuideAiConfiguration() {
  const configuration = await requestAIModelSelectionBootstrap();
  const providers = configuration.providers.filter(
    (provider) => provider.connectionType === 'openai-compatible'
  );
  const models = configuration.models.filter((model) =>
    providers.some((provider) => provider.id === model.providerId)
  );
  const defaultModelId = models.some((model) => model.id === configuration.defaultModelId)
    ? configuration.defaultModelId
    : (models[0]?.id ?? null);
  return { providers, models, defaultModelId };
}

/** Reads the committed authority again before request dispatch or proposal acceptance. */
export async function verifyGuideAiBasis(
  project: GuideProject,
  signal: AbortSignal,
  revision?: number
): Promise<number> {
  signal.throwIfAborted();
  const entry = await getScenarioProjectEntry(project.id);
  signal.throwIfAborted();
  if (
    !entry ||
    entry.project.updatedAt !== project.updatedAt ||
    (revision !== undefined && entry.workspaceRevision !== revision)
  )
    throw new GuideAiStaleError();
  return entry.workspaceRevision;
}

/** Explicit request transaction; cancellation fences preparation and late responses, never applies content. */
export async function requestGuideAiProposal(
  args: {
    project: GuideProject;
    scope: GuideAiScope;
    instruction: string;
    modelId: string;
    includeImages: boolean;
    signal: AbortSignal;
  },
  transport: RuntimeMessagingTransport = createRuntimeMessagingTransport()
) {
  const baseRevision = await verifyGuideAiBasis(args.project, args.signal);
  const content = selectGuideAiContent(args.project, args.scope);
  if (
    args.includeImages &&
    content.images.length > SCENARIO_EDITOR_AI_PAYLOAD_LIMITS.maxAttachmentCount
  )
    throw new Error('Too many selected images.');
  const attachments: ScenarioAIAttachment[] = [];
  if (args.includeImages) {
    for (const image of content.images) {
      args.signal.throwIfAborted();
      const blob = await getScenarioAssetBlob(image.block.assetId);
      if (!blob) throw new Error('Selected image unavailable.');
      const frame = await renderGuideImageFrame(blob, image.block, args.signal, 1024);
      attachments.push({
        stepId: image.stepId,
        stepNumber: image.stepNumber,
        filename: `frame-${attachments.length + 1}.png`,
        mimeType: 'image/png',
        dataUrl: await blobToDataUrl(frame),
      });
    }
  }
  args.signal.throwIfAborted();
  const payload = canonicalizeScenarioEditorEgressPayload({
    contractVersion: 4,
    projectId: args.project.id,
    baseRevision,
    scope: args.scope,
    attachments,
    projectSnapshotJson: JSON.stringify(content.snapshot),
    toolManifestJson: JSON.stringify(createScenarioAiManifest()),
  });
  assertScenarioEditorAiPayloadLimits({ ...payload, instruction: args.instruction });
  const authority = await createScenarioEditorEgressAuthority(payload);
  args.signal.throwIfAborted();
  const token = await requestLlmSessionToken('scenario-editor', authority);
  args.signal.throwIfAborted();
  await verifyGuideAiBasis(args.project, args.signal, baseRevision);
  const response = await transport.sendRuntimeMessage({
    ...payload,
    instruction: args.instruction,
    modelId: args.modelId,
    llmSessionToken: token,
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
  });
  args.signal.throwIfAborted();
  if (!response.success || !response.operations) throw new Error('AI proposal unavailable.');
  return {
    baseRevision,
    changes: prepareGuideAiProposal(args.project, args.scope, response.operations),
  };
}
