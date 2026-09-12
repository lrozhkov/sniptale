import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { resolveGuideStyle } from '../../../../../features/scenario/project/public';
import { listScenarioProjects } from '../../projects';
import { duplicateScenarioProjectRecord } from './duplicate';

/** Template discovery leaves raw aggregate enumeration available to backup and cleanup owners. */
export async function listScenarioStepTemplates() {
  return (await listScenarioProjects()).filter((project) => project.purpose === 'step-template');
}

/** Saves only the selected step; the existing copy owner publishes independent media atomically. */
export async function saveScenarioStepTemplate(
  source: GuideProject,
  stepId: string,
  name: string
): Promise<GuideProject> {
  const parsed = parseGuideProject(source);
  if (parsed.status !== 'ok') throw new Error('Invalid template source.');
  const step = parsed.project.items.find((item) => item.id === stepId);
  if (step?.kind !== 'step') throw new Error('Template step is unavailable.');
  return duplicateScenarioProjectRecord(
    {
      ...parsed.project,
      purpose: 'step-template',
      tags: [],
      style: resolveGuideStyle(parsed.project.style, step.styleOverrides),
      items: [{ ...step, styleOverrides: {} }],
    },
    name
  );
}
