import { getCurrentLocale, translate } from '../../../../../platform/i18n';
import { escapeHtml } from '../../helpers';
import { renderScenarioStepHeaderHtml } from '../fragments';

export function renderCaptureLightboxHtml(
  heading: string,
  lightboxId: string,
  fullImageDataUrl: string
): string {
  const locale = getCurrentLocale();

  return [
    `<section class="lightbox" id="${lightboxId}" hidden>`,
    '<button class="lightbox-backdrop" type="button" data-lightbox-close',
    ` aria-label="${escapeHtml(translate('scenario.editor.exportClosePreview', locale))}"></button>`,
    '<div class="lightbox-shell" role="dialog" aria-modal="true">',
    '<div class="lightbox-topline">',
    `<div class="lightbox-title">${heading}</div>`,
    '<button class="lightbox-close" type="button" data-lightbox-close',
    ` aria-label="${escapeHtml(translate('scenario.editor.exportClosePreview', locale))}">×</button>`,
    '</div>',
    '<div class="lightbox-frame"><div class="lightbox-stage">',
    `<img class="lightbox-image" src="${escapeHtml(fullImageDataUrl)}" alt="${heading}" />`,
    '</div></div>',
    '</div>',
    '</section>',
  ].join('');
}

export function renderCaptureMediaHtml(
  heading: string,
  lightboxId: string,
  previewDataUrl: string,
  fullImageDataUrl: string | null
): string {
  const locale = getCurrentLocale();

  return fullImageDataUrl
    ? [
        '<button class="capture-media-link" type="button" data-lightbox-trigger',
        ` data-lightbox-target="${lightboxId}"`,
        ` aria-label="${escapeHtml(translate('scenario.editor.exportOpenFullImage', locale))}">`,
        `<img class="capture-preview" src="${escapeHtml(previewDataUrl)}" alt="${heading}" />`,
        '<span class="capture-action" aria-hidden="true">⤢</span>',
        '</button>',
      ].join('')
    : `<img class="capture-preview" src="${escapeHtml(previewDataUrl)}" alt="${heading}" />`;
}

export function renderCaptureSectionHtml(args: {
  body: string;
  captureIndex: number;
  fullImageDataUrl: string | null;
  heading: string;
  lightboxId: string;
  previewDataUrl: string;
}): string {
  return [
    '<section class="capture-step">',
    '<div class="step-topline">',
    renderScenarioStepHeaderHtml(args.heading, args.captureIndex),
    args.body,
    '</div>',
    '<figure class="capture-media">',
    renderCaptureMediaHtml(
      args.heading,
      args.lightboxId,
      args.previewDataUrl,
      args.fullImageDataUrl
    ),
    '</figure>',
    '</section>',
  ].join('');
}
