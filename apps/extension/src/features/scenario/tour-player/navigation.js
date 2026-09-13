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
  return {
    render,
    reset(details) {
      navigationPage = 0;
      navigationDetails = details;
    },
    closeDetails() {
      navigationDetails = false;
    },
  };
}
