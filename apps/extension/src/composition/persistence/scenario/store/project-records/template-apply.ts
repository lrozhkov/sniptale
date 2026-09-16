import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type {
  GuideImageBlock,
  GuideProject,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  applyGuideTemplateAppearance,
  classifyGuideStepContent,
} from '../../../../../features/scenario/project/public';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';
import type { PreparedScenarioAssetEntry, ScenarioStepEditorDocumentEntry } from '../../contracts';
import { commitScenarioAggregateMutation } from '../../aggregate-mutations';
import { rejectScenarioMutationBeforeHandoff } from '../../asset-staging';
import { getScenarioProject } from '../../projects';
import { createCopyChildren, remapCopyReferences } from './copy-children';

export type GuideTemplateApplication = 'appearance' | 'replace' | 'capture';

/** Applies a reread local template through the existing revisioned aggregate publication owner. */
export async function applyScenarioStepTemplate(args: {
  project: GuideProject;
  baseUpdatedAt: number;
  stepId: string;
  templateId: string;
  mode: GuideTemplateApplication;
}): Promise<GuideProject> {
  const parsed = parseGuideProject(args.project);
  if (parsed.status !== 'ok') throw new Error('Invalid template destination.');
  const project = parsed.project;
  const target = project.items.find((item) => item.id === args.stepId);
  const template = await getScenarioProject(args.templateId);
  const source = template?.items[0];
  if (target?.kind !== 'step' || template?.purpose !== 'step-template' || source?.kind !== 'step')
    throw new Error('Template or destination step is unavailable.');
  const assets: PreparedScenarioAssetEntry[] = [];
  const documents: ScenarioStepEditorDocumentEntry[] = [];
  let handedOff = false;
  try {
    let next: GuideStep;
    if (args.mode === 'appearance') {
      next = applyGuideTemplateAppearance(target, source, template.style, template.id);
    } else {
      const content = structuredClone(source);
      const captured = args.mode === 'capture' ? retainCapturedImage(target, content) : null;
      const detached = { ...project, items: [content] };
      await remapCopyReferences(
        detached,
        createCopyChildren(template.id, project, assets, documents)
      );
      if (captured) content.blocks.splice(captured.index, 0, captured.image);
      next = {
        ...content,
        id: target.id,
        templateId: template.id,
        styleOverrides: { ...template.style, ...source.styleOverrides },
      };
      delete next.numbering;
      if (target.numbering) next.numbering = { ...target.numbering };
      if (captured) next.title = target.title || source.title;
    }
    project.items = project.items.map((item) => (item.id === target.id ? next : item));
    const result = parseGuideProject(project);
    if (result.status !== 'ok') throw new Error('Template result exceeds guide limits.');
    handedOff = true;
    const committed = await commitScenarioAggregateMutation(result.project, {
      expectedUpdatedAt: args.baseUpdatedAt,
      children: { assetPuts: assets, editorDocumentPuts: documents },
    });
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return committed.project;
  } catch (error) {
    if (!handedOff) return rejectScenarioMutationBeforeHandoff({ assetPuts: assets }, error);
    throw error;
  }
}

/** Removes only the template's first image slot before staging; the user's screenshot stays owned. */
function retainCapturedImage(
  target: GuideStep,
  content: GuideStep
): { index: number; image: GuideImageBlock } {
  if (classifyGuideStepContent(target) !== 'image')
    throw new Error('Capture preservation is unavailable.');
  const image = target.blocks.find((block) => block.kind === 'image');
  if (!image) throw new Error('Captured image is unavailable.');
  const index = content.blocks.findIndex(
    (block) => block.kind === 'image' || block.kind === 'image-slot'
  );
  const slot = index < 0 ? undefined : content.blocks.splice(index, 1)[0];
  const retained = { ...image, id: crypto.randomUUID() };
  delete retained.width;
  delete retained.rowStart;
  if (slot?.rowStart !== undefined) retained.rowStart = slot.rowStart;
  if (slot?.width !== undefined) retained.width = slot.width;
  return { index: index < 0 ? content.blocks.length : index, image: retained };
}
