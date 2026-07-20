import { getScenarioAssetBlob } from '../../../../composition/persistence/scenario/store/project-records/assets';
import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import type {
  ScenarioAIAttachment,
  ScenarioEditorProjectSnapshot,
  ScenarioEditorStepSnapshot,
} from '../../../../contracts/ai/scenario';
import { renderCaptureStepAttachment, type ScenarioRenderedAttachment } from './render';
import { summarizeScenarioOverlay } from './overlays';
import {
  compactScenarioAiText,
  redactScenarioAiUrl,
} from '../../../../features/ai/scenario-redaction';

export type ScenarioAiAttachmentMode = 'current' | 'none';

async function forEachWithConcurrency<TItem>(
  items: TItem[],
  limit: number,
  run: (item: TItem, index: number) => Promise<void>
) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await run(items[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function buildSnapshotStep(args: {
  imageFilename?: string;
  step: ScenarioProject['steps'][number];
  stepNumber: number;
}): ScenarioEditorStepSnapshot {
  return {
    body: args.step.body ?? '',
    currentOverlaysSummary:
      args.step.kind === 'capture' ? args.step.overlays.map(summarizeScenarioOverlay) : [],
    currentZoom: args.step.kind === 'capture' ? args.step.imageTransform.scale : 1,
    interactionPoint: args.step.kind === 'capture' ? args.step.interactionPoint : null,
    kind: args.step.kind,
    page:
      args.step.kind === 'capture'
        ? {
            devicePixelRatio: args.step.page.devicePixelRatio,
            scrollX: args.step.page.scrollX,
            scrollY: args.step.page.scrollY,
            title: compactScenarioAiText(args.step.page.title),
            url: redactScenarioAiUrl(args.step.page.url),
            viewport: args.step.page.viewport,
          }
        : null,
    stepId: args.step.id,
    stepNumber: args.stepNumber,
    target:
      args.step.kind === 'capture' && args.step.target
        ? {
            ariaLabel: compactScenarioAiText(args.step.target.ariaLabel),
            rect: args.step.target.rect,
            role: args.step.target.role,
            selector: compactScenarioAiText(args.step.target.selector),
            tagName: args.step.target.tagName,
            text: compactScenarioAiText(args.step.target.text),
            title: compactScenarioAiText(args.step.target.title),
          }
        : null,
    title: args.step.title,
    ...(args.imageFilename === undefined ? {} : { imageFilename: args.imageFilename }),
  };
}

async function collectAttachmentByStepId(args: {
  attachmentMode: ScenarioAiAttachmentMode;
  getAssetBlob: typeof getScenarioAssetBlob;
  project: ScenarioProject;
  selectedStepId?: string | null;
}) {
  const attachmentByStepId = new Map<string, ScenarioRenderedAttachment>();

  if (args.attachmentMode === 'none') {
    return attachmentByStepId;
  }

  await forEachWithConcurrency(args.project.steps, 3, async (step, index) => {
    if (step.kind !== 'capture' || step.id !== args.selectedStepId) {
      return;
    }

    const assetBlob = await args.getAssetBlob(step.assetId);
    if (!assetBlob) {
      return;
    }

    const attachment = await renderCaptureStepAttachment({
      assetBlob,
      step,
      stepNumber: index + 1,
    });
    attachmentByStepId.set(step.id, attachment);
  });

  return attachmentByStepId;
}

function buildProjectSnapshot(args: {
  attachmentByStepId: Map<string, ScenarioRenderedAttachment>;
  project: ScenarioProject;
}) {
  const steps = args.project.steps.map((step, index) => {
    const attachment = args.attachmentByStepId.get(step.id);
    return buildSnapshotStep({
      step,
      stepNumber: index + 1,
      ...(attachment?.filename === undefined ? {} : { imageFilename: attachment.filename }),
    });
  });
  return { steps };
}

export async function buildScenarioEditorLLMPayload(args: {
  attachmentMode?: ScenarioAiAttachmentMode;
  getAssetBlob?: typeof getScenarioAssetBlob;
  project: ScenarioProject;
  selectedStepId?: string | null;
}): Promise<{
  attachments: ScenarioAIAttachment[];
  projectSnapshot: ScenarioEditorProjectSnapshot;
  projectSnapshotJson: string;
}> {
  const getAssetBlob = args.getAssetBlob ?? getScenarioAssetBlob;
  const attachmentByStepId = await collectAttachmentByStepId({
    attachmentMode: args.attachmentMode ?? 'none',
    getAssetBlob,
    project: args.project,
    selectedStepId: args.selectedStepId ?? null,
  });
  const projectSnapshot = buildProjectSnapshot({ attachmentByStepId, project: args.project });

  return {
    attachments: Array.from(attachmentByStepId.values()).map((attachment) => ({
      dataUrl: attachment.dataUrl,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      stepId: attachment.stepId,
      stepNumber: attachment.stepNumber,
    })),
    projectSnapshot,
    projectSnapshotJson: JSON.stringify(projectSnapshot, null, 2),
  };
}
