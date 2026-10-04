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
  let composition = null;
  function render(slide, stageWidth, stageHeight, selectedObjectId) {
    const reveal =
      authoring &&
      (composition?.slide !== slide ||
        composition?.stageWidth !== stageWidth ||
        composition?.stageHeight !== stageHeight ||
        composition?.selectedObjectId !== selectedObjectId);
    composition = { slide, stageWidth, stageHeight, selectedObjectId };
    const rendered = renderTourNavigationScene({
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
      selectedObjectId: reveal ? selectedObjectId : null,
      onPage: (page) => {
        navigationPage = page;
        redraw();
      },
    });
    navigationPage = rendered.page;
    return rendered;
  }

  function openContents(slides, index, onSelect, endScreen) {
    const navigation = root.querySelector('[data-tour-navigation]');
    const trigger = root.querySelector('[data-tour-contents]');
    if (navigation.open) {
      closeContents(false);
      return;
    }
    navigation.replaceChildren();
    const list = element('div', 'tour-contents-list');
    let current = null;
    const entries = slides.map((slide, number) => ({
      key: number,
      label: `${number + 1}. ${slide.title}`,
      title: slide.title,
    }));
    if (endScreen?.enabled)
      entries.push({ key: 'end', label: labels.end ?? labels.finished, title: endScreen.title });
    entries.forEach((entry) => {
      const button = actionButton(entry.label, { kind: 'none' }, 'tour-button');
      button.title = entry.title;
      if (entry.key === index) {
        button.setAttribute('aria-current', 'step');
        current = button;
      }
      button.addEventListener('click', () => {
        onSelect(entry.key === 'end' ? slides.length : entry.key);
        closeContents(true);
      });
      list.append(button);
    });
    const header = element('div', 'tour-contents-header');
    const heading = element('h2', 'tour-contents-title');
    heading.textContent = labels.contents;
    const close = actionButton(labels.close, { kind: 'none' }, 'tour-button');
    close.addEventListener('click', () => closeContents(true));
    header.append(heading, close);
    navigation.append(header, list);
    navigation.setAttribute('open', '');
    trigger.setAttribute('aria-expanded', 'true');
    current?.scrollIntoView?.({ block: 'nearest' });
    (current ?? close).focus({ preventScroll: true });
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
    if (!navigation.open || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeContents(true);
    } else if (event.key === 'Tab') {
      const buttons = [...navigation.querySelectorAll('button')];
      const active = navigation.getRootNode().activeElement;
      const next = buttons.indexOf(active) + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= buttons.length) {
        event.preventDefault();
        buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
      }
    }
  }

  function onContentsPointerDown(event) {
    const navigation = root.querySelector('[data-tour-navigation]');
    if (!navigation.open || !(event.target instanceof globalThis.Element)) return;
    if (
      event
        .composedPath()
        .some(
          (node) =>
            node === navigation ||
            (node instanceof globalThis.Element && node.matches('[data-tour-contents]'))
        )
    )
      return;
    closeContents(false);
  }

  return {
    render,
    openContents,
    closeContents: () => closeContents(false),
    reset() {
      navigationPage = 0;
      composition = null;
    },
  };
}
