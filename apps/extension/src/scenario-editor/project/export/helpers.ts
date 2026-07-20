import type {
  ScenarioCaptureStep,
  ScenarioStep,
} from '../../../features/scenario/contracts/types/project';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';

export type ScenarioAssetResolver = (assetId: string) => Promise<Blob | undefined>;

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'scenario'
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resolveStepHeading(step: ScenarioStep, fallbackIndex: number): string {
  return step.title.trim() || `Step ${fallbackIndex + 1}`;
}

export function renderMarkdownCaptureStep(
  step: ScenarioCaptureStep,
  index: number,
  imageFormat: ScenarioExportImageFormat
): string {
  const imageName = `assets/step-${index + 1}.${imageFormat}`;
  return [
    `## ${resolveStepHeading(step, index)}`,
    `![${resolveStepHeading(step, index)}](${imageName})`,
    step.body.trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function renderMarkdownStep(step: ScenarioStep, index: number): string {
  if (step.kind === 'divider') {
    return '\n---\n';
  }

  const headingLevel = step.kind === 'section' ? '##' : '###';
  if (step.kind === 'section') {
    return `${headingLevel} ${resolveStepHeading(step, index)}`;
  }

  return [`${headingLevel} ${resolveStepHeading(step, index)}`, step.body.trim()]
    .filter(Boolean)
    .join('\n\n');
}
