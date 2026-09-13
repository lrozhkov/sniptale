export function createTourNavigation({
  root,
  labels,
  media,
  element,
  actionButton,
  hintController,
  redraw,
}) {
  let navigationPage = 0;
  let navigationDetails = false;
  function render(slide, stageWidth, stageHeight) {
    const panel = element('section', 'tour-navigation-scene');
    panel.style.backgroundColor = slide.background.color;
    if (slide.background.image) {
      const image = element('img', 'tour-navigation-image');
      image.src = media.get(slide.background.image.assetId);
      image.alt = slide.background.image.alt;
      panel.append(image);
    }
    const heading = element('h1', '', slide.title);
    const headingRow = element('div', 'tour-navigation-heading');
    headingRow.append(heading);
    panel.append(headingRow);
    if (slide.description) {
      const details = actionButton('ⓘ', { kind: 'none' }, 'tour-button tour-details');
      details.addEventListener('click', () => {
        navigationDetails = !navigationDetails;
        if (navigationDetails) hintController.reset();
        redraw();
      });
      details.setAttribute('aria-label', labels.details);
      details.title = labels.details;
      headingRow.append(details);
    }
    const fontSize = parseFloat(globalThis.getComputedStyle(root).fontSize) || 16;
    const columns = Math.max(1, Math.min(3, Math.floor(stageWidth / (fontSize * 8))));
    const pageSize = Math.max(
      1,
      Math.min(12, Math.floor((stageHeight - 110) / Math.max(48, fontSize * 1.3 + 14)) * columns)
    );
    navigationPage = Math.min(
      navigationPage,
      Math.max(0, Math.ceil(slide.buttons.length / pageSize) - 1)
    );
    const buttons = element('div', 'tour-navigation-buttons');
    buttons.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    for (const button of slide.buttons.slice(
      navigationPage * pageSize,
      navigationPage * pageSize + pageSize
    ))
      buttons.append(actionButton(button.label, button.action, 'tour-button'));
    panel.append(buttons);
    if (slide.buttons.length > pageSize) {
      const previousPage = actionButton(labels.previous, { kind: 'none' }, 'tour-button');
      const nextPage = actionButton(labels.next, { kind: 'none' }, 'tour-button');
      previousPage.disabled = navigationPage === 0;
      nextPage.disabled = (navigationPage + 1) * pageSize >= slide.buttons.length;
      previousPage.addEventListener('click', () => {
        navigationPage -= 1;
        redraw();
      });
      nextPage.addEventListener('click', () => {
        navigationPage += 1;
        redraw();
      });
      const pager = element('div', 'tour-navigation-pager');
      pager.append(previousPage, nextPage);
      panel.append(pager);
    }

    const hints =
      slide.description && navigationDetails
        ? [
            {
              text: slide.description,
              appearance: { presentation: 'caption-bottom', alignment: 'start' },
            },
          ]
        : [];
    return { panel, hints };
  }
  function openContents(slides, index, onSelect) {
    const navigation = root.querySelector('[data-tour-navigation]');
    let page = Math.floor(index / 12);
    const draw = () => {
      navigation.replaceChildren();
      const close = actionButton(labels.close, { kind: 'none' }, 'tour-button');
      close.addEventListener('click', () => navigation.close());
      navigation.append(close);
      const list = element('div', 'tour-contents-list');
      for (const [offset, slide] of slides.slice(page * 12, page * 12 + 12).entries()) {
        const number = page * 12 + offset;
        const button = actionButton(
          `${number + 1}. ${slide.title}`,
          { kind: 'none' },
          'tour-button'
        );
        button.title = slide.title;
        button.addEventListener('click', () => {
          onSelect(number);
          navigation.close();
        });
        list.append(button);
      }
      navigation.append(list);
      const before = actionButton(labels.previous, { kind: 'none' }, 'tour-button');
      const after = actionButton(labels.next, { kind: 'none' }, 'tour-button');
      before.disabled = page === 0;
      after.disabled = (page + 1) * 12 >= slides.length;
      before.addEventListener('click', () => {
        page -= 1;
        draw();
      });
      after.addEventListener('click', () => {
        page += 1;
        draw();
      });
      navigation.append(before, after);
    };
    draw();
    navigation.showModal();
  }
  return {
    render,
    openContents,
    reset(details) {
      navigationPage = 0;
      navigationDetails = details;
    },
    closeDetails() {
      navigationDetails = false;
    },
  };
}
