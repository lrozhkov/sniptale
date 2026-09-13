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
    reset() {
      navigationPage = 0;
    },
  };
}
