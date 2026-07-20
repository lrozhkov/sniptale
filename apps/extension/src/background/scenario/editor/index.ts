import { browserTabs } from '@sniptale/platform/browser/tabs';
import { buildScenarioEditorUrl } from '../../../platform/navigation/extension-pages/scenario-editor';

/**
 * Opens the scenario editor page for the provided project when available.
 */
export async function openScenarioEditor(
  projectId?: string | null,
  stepId?: string | null
): Promise<void> {
  await browserTabs.create({
    url: buildScenarioEditorUrl({
      ...(projectId ? { projectId } : {}),
      ...(stepId ? { stepId } : {}),
    }),
  });
}
