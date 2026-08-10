import type { EditorDocument } from '../../../../../features/editor/document/types';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import type { ScenarioAssetEntry as DbScenarioAssetEntry } from '../../contracts';
import { commitScenarioAggregateMutation } from '../../aggregate-mutations';

export async function persistScenarioCaptureArtifacts(args: {
  assetEntry: DbScenarioAssetEntry;
  baseUpdatedAt: number;
  project: ScenarioProject;
  projectId: string;
  stepId: string;
  stepDocument: EditorDocument | null;
}): Promise<ScenarioProject> {
  const result = await commitScenarioAggregateMutation(args.project, {
    children: {
      assetPuts: [args.assetEntry],
      ...(args.stepDocument
        ? {
            editorDocumentPuts: [
              {
                stepId: args.stepId,
                projectId: args.projectId,
                document: args.stepDocument,
                createdAt: 0,
                updatedAt: args.project.updatedAt,
              },
            ],
          }
        : {}),
    },
    expectedUpdatedAt: args.baseUpdatedAt,
  });
  return result.project;
}
