import { extractLinkText } from '../../../dom-utils/dom-helpers';
import type { FieldValueType } from '../forms/fields.helpers';

export type MvsTitleInfo = {
  linkRef?: string;
  sourceElement: HTMLElement;
  text: string;
};

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

export function extractMeaningfulText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'script, style, svg, img, path, rect, circle, ellipse, polygon, polyline, line'
    )
    .forEach((node) => node.remove());
  return normalizeText(clone.textContent || '');
}

export function resolveLinkValue(element: HTMLElement): {
  linkRef?: string;
  value: string;
  valueType: FieldValueType;
} {
  const linkData = extractLinkText(element);
  if (linkData.href && linkData.text) {
    return {
      linkRef: linkData.href,
      value: normalizeText(linkData.text),
      valueType: 'link',
    };
  }

  return {
    value: extractMeaningfulText(element),
    valueType: 'string',
  };
}

function findTitleFromLink(block: HTMLElement): MvsTitleInfo | null {
  const titleLink = block.querySelector<HTMLElement>('a[href][target="_top"], a[href*="#uuid:"]');
  if (!titleLink) {
    return null;
  }

  const titleData = resolveLinkValue(titleLink);
  if (!titleData.value) {
    return null;
  }

  return {
    sourceElement: titleLink,
    text: titleData.value,
    ...(titleData.linkRef === undefined ? {} : { linkRef: titleData.linkRef }),
  };
}

function findTitleFromDataTitle(block: HTMLElement): MvsTitleInfo | null {
  const titledElement = Array.from(block.querySelectorAll<HTMLElement>('[data-title]')).find(
    (element) => normalizeText(element.getAttribute('data-title') || '').length > 0
  );
  if (!titledElement) {
    return null;
  }

  const text = normalizeText(titledElement.getAttribute('data-title') || '');
  return text
    ? {
        sourceElement: titledElement,
        text,
      }
    : null;
}

function findTitleFromText(block: HTMLElement): MvsTitleInfo | null {
  const titledElement = Array.from(block.querySelectorAll<HTMLElement>('[title]')).find(
    (element) => {
      const text = extractMeaningfulText(element);
      return text.length > 0 && text.length <= 200;
    }
  );
  if (!titledElement) {
    return null;
  }

  const text = extractMeaningfulText(titledElement);
  return text
    ? {
        sourceElement: titledElement,
        text,
      }
    : null;
}

export function resolveBlockTitle(block: HTMLElement): MvsTitleInfo | null {
  return findTitleFromLink(block) || findTitleFromDataTitle(block) || findTitleFromText(block);
}
