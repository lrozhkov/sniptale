import { escapeHtml } from '../helpers';

export interface ScenarioHtmlSectionRender {
  lightboxHtml?: string;
  sectionHtml: string;
}

export function formatScenarioStepIndex(index: number): string {
  return String(index).padStart(2, '0');
}

export function renderScenarioStepHeaderHtml(heading: string, captureIndex: number): string {
  return [
    '<div class="step-header">',
    `<h2 class="step-title">${heading}</h2>`,
    `<span class="step-index">${formatScenarioStepIndex(captureIndex)}</span>`,
    '</div>',
  ].join('');
}

export function renderScenarioTextBodyHtml(body: string, className?: string): string {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return '';
  }

  return className
    ? `<p class="${className}">${escapeHtml(trimmedBody)}</p>`
    : `<p>${escapeHtml(trimmedBody)}</p>`;
}
