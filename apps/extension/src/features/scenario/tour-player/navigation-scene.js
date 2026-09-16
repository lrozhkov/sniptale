import { serializePaintToCss } from '@sniptale/foundation/paint';
import { TOUR_NAVIGATION_LAYOUT } from '@sniptale/runtime-contracts/scenario/types/tour';
import { measureHintPages } from './hints.js';

/** One measured composition is used in authoring and standalone playback, without scroll areas. */
export function renderTourNavigationScene({
  root,
  slide,
  stageWidth,
  stageHeight,
  labels,
  media,
  element,
  actionButton,
  authoring,
  page,
  onPage,
}) {
  const { panel, content, layout, padding, gap, available, textPages, text } = prepareComposition({
    root,
    slide,
    stageWidth,
    stageHeight,
    media,
    element,
    page,
  });
  const fontSize = parseFloat(globalThis.getComputedStyle(root).fontSize) || 16;
  const contentWidth = ((stageWidth - padding * 2) * layout.width) / 100;
  const columns = Math.max(1, Math.min(layout.columns, Math.floor(contentWidth / (fontSize * 8))));
  const used = content.getBoundingClientRect().height || (slide.title ? 38 : 0) + (text ? 48 : 0);
  const rowHeight = Math.min(48, Math.max(28, available * 0.18));
  const rowCount = Math.max(
    1,
    Math.floor((available - used - rowHeight - gap * 3) / (rowHeight + gap))
  );
  const pageSize = Math.min(12, rowCount * columns);
  const count = Math.max(textPages.length, Math.ceil(slide.buttons.length / pageSize));
  const current = Math.min(page, Math.max(0, count - 1));
  const buttons = element('div', 'tour-navigation-buttons');
  buttons.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  buttons.style.gap = `${gap}px`;
  const buttonPage = Math.min(current, Math.max(0, Math.ceil(slide.buttons.length / pageSize) - 1));
  for (const button of slide.buttons.slice(buttonPage * pageSize, (buttonPage + 1) * pageSize)) {
    const node = actionButton(button.label, button.action, 'tour-button', button.id);
    node.style.height = `${rowHeight}px`;
    if (!authoring && button.narration?.trigger === 'activation') {
      const group = element('div', 'tour-navigation-audio');
      group.style.display = 'flex';
      group.style.gap = '4px';
      node.style.flex = '1';
      const voice = element('button', 'tour-button', labels.play);
      voice.type = 'button';
      voice.dataset.tourNarration = button.id;
      group.append(node, voice);
      buttons.append(group);
    } else buttons.append(node);
  }
  if (slide.buttons.length) content.append(buttons);
  if (count > 1) {
    const pager = element('div', 'tour-navigation-pager');
    const previous = actionButton(labels.previous, { kind: 'none' }, 'tour-button');
    const next = actionButton(labels.next, { kind: 'none' }, 'tour-button');
    previous.disabled = current === 0;
    next.disabled = current === count - 1;
    previous.addEventListener('click', () => onPage(current - 1));
    next.addEventListener('click', () => onPage(current + 1));
    pager.append(previous, element('span', '', `${current + 1} / ${count}`), next);
    content.append(pager);
  }
  return { panel, hints: [] };
}

/** Scene sizing and visible text are measured before allocating the button page. */
function prepareComposition({ root, slide, stageWidth, stageHeight, media, element, page }) {
  const layout = slide.layout ?? TOUR_NAVIGATION_LAYOUT;
  const panel = element('section', 'tour-navigation-scene');
  panel.style.background = slide.background.paint
    ? serializePaintToCss(slide.background.paint)
    : slide.background.color;
  const padding = (Math.min(stageWidth, stageHeight) * layout.padding) / 100;
  const gap = layout.gap * Math.min(1, stageWidth / 640);
  panel.style.padding = `${padding}px`;
  panel.style.justifyContent = { start: 'flex-start', center: 'center', end: 'flex-end' }[
    layout.vertical
  ];
  panel.style.alignItems = { start: 'flex-start', center: 'center', end: 'flex-end' }[layout.align];
  if (slide.background.image) {
    const image = element('img', 'tour-navigation-image');
    image.src = media.get(slide.background.image.assetId);
    image.alt = slide.background.image.alt;
    panel.append(image);
  }
  const content = element('div', 'tour-navigation-content');
  content.style.width = `${layout.width}%`;
  content.style.textAlign = { start: 'left', center: 'center', end: 'right' }[layout.align];
  content.style.gap = `${gap}px`;
  panel.append(content);
  root.querySelector('[data-tour-scene]').append(panel);
  const available = Math.max(1, stageHeight - padding * 2);
  if (slide.title) {
    const heading = element('h1', '', slide.title);
    heading.title = slide.title;
    heading.style.maxHeight = `${available * 0.22}px`;
    content.append(heading);
  }
  let textPages = [''];
  let text = null;
  if (slide.description) {
    text = element('p', 'tour-navigation-text');
    text.style.maxHeight = `${available * 0.3}px`;
    content.append(text);
    textPages = measureHintPages(text, slide.description);
    // Button offsets must not change when the last text page is shorter.
    if (textPages.length > 1) text.style.height = text.style.maxHeight;
    text.textContent = textPages[Math.min(page, textPages.length - 1)];
  }
  return { panel, content, layout, padding, gap, available, textPages, text };
}
