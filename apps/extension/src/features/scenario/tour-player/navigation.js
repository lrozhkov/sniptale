import { renderTourNavigationScene } from './navigation-scene.js';
export function createTourNavigation({
  root,
  labels,
  media,
  element,
  actionButton,
  redraw,
  authoring,
}) {
  let navigationPage = 0;
  function render(slide, stageWidth, stageHeight) {
    return renderTourNavigationScene({
      root,
      slide,
      stageWidth,
      stageHeight,
      labels,
      media,
      element,
      actionButton,
      authoring,
      page: navigationPage,
      onPage: (page) => {
        navigationPage = page;
        redraw();
      },
    });
  }

  function openContents(slides, index, onSelect) {
    const navigation = root.querySelector('[data-tour-navigation]');
    const trigger = root.querySelector('[data-tour-contents]');
    if (navigation.open) {
      closeContents(false);
      return;
    }
    navigation.replaceChildren();
    const list = element('div', 'tour-contents-list');
    let current = null;
    slides.forEach((slide, number) => {
      const button = actionButton(`${number + 1}. ${slide.title}`, { kind: 'none' }, 'tour-button');
      button.title = slide.title;
      if (number === index) {
        button.setAttribute('aria-current', 'step');
        current = button;
      }
      button.addEventListener('click', () => {
        onSelect(number);
        closeContents(true);
      });
      list.append(button);
    });
    navigation.append(list);
    const player = root.getBoundingClientRect();
    const bounds = trigger.getBoundingClientRect();
    navigation.style.left = `${bounds.left - player.left}px`;
    navigation.style.top = `${bounds.bottom - player.top + 6}px`;
    navigation.setAttribute('open', '');
    trigger.setAttribute('aria-expanded', 'true');
    current?.scrollIntoView?.({ block: 'nearest' });
    current?.focus({ preventScroll: true });
    root.ownerDocument.addEventListener('keydown', onContentsKey, true);
    root.ownerDocument.addEventListener('pointerdown', onContentsPointerDown, true);
  }

  function closeContents(restoreFocus) {
    const navigation = root.querySelector('[data-tour-navigation]');
    if (!navigation.open) return;
    const trigger = root.querySelector('[data-tour-contents]');
    root.ownerDocument.removeEventListener('keydown', onContentsKey, true);
    root.ownerDocument.removeEventListener('pointerdown', onContentsPointerDown, true);
    navigation.removeAttribute('open');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  function onContentsKey(event) {
    const navigation = root.querySelector('[data-tour-navigation]');
    if (event.key !== 'Escape' || !navigation.open || event.defaultPrevented) return;
    event.preventDefault();
    closeContents(true);
  }

  function onContentsPointerDown(event) {
    const navigation = root.querySelector('[data-tour-navigation]');
    if (!navigation.open || !(event.target instanceof globalThis.Element)) return;
    if (navigation.contains(event.target) || event.target.closest('[data-tour-contents]')) return;
    closeContents(false);
  }

  return {
    render,
    openContents,
    closeContents: () => closeContents(false),
    reset() {
      navigationPage = 0;
    },
  };
}
