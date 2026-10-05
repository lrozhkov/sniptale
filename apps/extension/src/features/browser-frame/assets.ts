import chromeDefaultThemeTemplate from './template/chrome-default-theme.svg?raw';

function extractTemplateInnerMarkup(template: string): string {
  const match = template.match(/^<svg[^>]*>([\s\S]*)<\/svg>\s*$/i);
  return (match?.[1] ?? template).trim();
}

function findTagStart(template: string, markerIndex: number): number {
  return template.lastIndexOf('<', markerIndex);
}

function findTagName(template: string, tagStart: number): string {
  let index = tagStart + 1;
  let name = '';

  while (index < template.length) {
    const character = template[index];
    if (!character || character === ' ' || character === '>') {
      break;
    }
    name += character;
    index += 1;
  }

  return name;
}

function extractNodeMarkup(template: string, id: string): string {
  const marker = `id="${id}"`;
  const markerIndex = template.indexOf(marker);
  if (markerIndex < 0) {
    return '';
  }

  const tagStart = findTagStart(template, markerIndex);
  if (tagStart < 0) {
    return '';
  }

  const tagName = findTagName(template, tagStart);
  if (!tagName) {
    return '';
  }

  const closingTag = `</${tagName}>`;
  const closingIndex = template.indexOf(closingTag, markerIndex);
  if (closingIndex < 0) {
    return '';
  }

  return template.slice(tagStart, closingIndex + closingTag.length).trim();
}

function removeNodeMarkup(template: string, id: string): string {
  const nodeMarkup = extractNodeMarkup(template, id);
  if (!nodeMarkup) {
    return template;
  }

  return template.replace(`${nodeMarkup}\n`, '').replace(nodeMarkup, '');
}

const templateInnerMarkup = extractTemplateInnerMarkup(chromeDefaultThemeTemplate);
const shellMarkup = removeNodeMarkup(
  removeNodeMarkup(templateInnerMarkup, 'tab-title'),
  'address-url'
);

export const EXACT_BROWSER_FRAME_REFERENCE = {
  headerHeight: 86,
  headerWidth: 931,
  leftSliceWidth: 527,
  rightSliceX: 794,
  rightSliceWidth: 137,
  faviconSlot: {
    height: 16,
    radius: 4,
    width: 16,
    x: 54,
    y: 18,
  },
  faviconPlaceholderMarkup: extractNodeMarkup(templateInnerMarkup, 'tab-favicon-placeholder'),
  shellMarkup,
  shellMarkupWithoutFavicon: removeNodeMarkup(shellMarkup, 'tab-favicon-placeholder'),
  tabTitleMarkup: extractNodeMarkup(templateInnerMarkup, 'tab-title'),
  templateInnerMarkup,
  urlMarkup: extractNodeMarkup(templateInnerMarkup, 'address-url'),
  titleSlot: {
    height: 24,
    radius: 8,
    width: 186,
    x: 72,
    y: 12,
  },
  titleText: {
    baselineY: 30.3636,
    x: 78,
  },
  urlSlot: {
    height: 24,
    radius: 12,
    width: 636,
    x: 134,
    y: 52,
  },
  urlText: {
    baselineY: 68.3636,
    x: 134,
  },
} as const;

export const EXACT_BROWSER_FRAME_TOKENS = {
  contentBorder: '#d8dde5',
  contentStroke: '#eef1f5',
  bodyFill: '#ffffff',
  shadowColor: '#1e293b',
  titleFont: 'Segoe UI, Arial, sans-serif',
  titleText: '#1f1f1f',
  urlFont: 'Segoe UI, Arial, sans-serif',
  urlText: '#202020',
} as const;
