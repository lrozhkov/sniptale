import { renderTourImage } from './image-scene.js';
import { createTourNavigation } from './navigation.js';
import { createTourHints } from './hints.js';

/** Owns current scene geometry and explanation state, independent from playback history. */
export function createTourScene(root, { tour, assets, labels }, onAction, signal) {
  const media = new Map(assets.map((asset) => [asset.id, asset.src]));
  const query = (name) => root.querySelector(`[data-tour-${name}]`);
  const viewport = query('viewport');
  const stage = query('stage');
  const scene = query('scene');
  let current = null;
  let ended = false;
  let stageWidth = 640;
  let stageHeight = 360;
  const hintController = createTourHints(root, tour.style.textAppearance, {
    signal,
    onClose: () => navigationController.closeDetails(),
    focusTrigger: (activeIndex) => {
      const trigger =
        scene.querySelectorAll('.tour-hotspot')[activeIndex] ??
        scene.querySelector('.tour-details') ??
        query('contents');
      trigger.focus();
    },
  });
  const navigationController = createTourNavigation({
    root,
    labels,
    media,
    element,
    actionButton,
    hintController,
    redraw: render,
  });

  function element(tag, className, text) {
    const node = root.ownerDocument.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function actionButton(label, action, className) {
    const node = element(action.kind === 'url' ? 'a' : 'button', className, label);
    if (action.kind === 'url') {
      node.href = action.url;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    } else {
      node.type = 'button';
      node.addEventListener('click', () => onAction(action));
    }
    node.title = label;
    return node;
  }
  function render() {
    if (signal.aborted) return;
    scene.replaceChildren();
    let imageBox = null;
    let hints = [];
    const slide = ended ? endSlide(tour, labels) : current;
    if (slide?.kind === 'image') {
      imageBox = renderTourImage(
        slide,
        { stageWidth, stageHeight },
        {
          scene,
          element,
          labels,
          media,
          actionButton,
          hintController,
          onAction,
        }
      );
      hints = slide.image ? [...slide.hotspots, ...slide.annotations] : [];
    } else if (slide) {
      const rendered = navigationController.render(slide, stageWidth, stageHeight);
      scene.append(rendered.panel);
      hints = rendered.hints;
    } else scene.append(element('p', 'tour-empty', labels.empty));
    hintController.show(hints, { stageWidth, stageHeight, imageBox });
  }
  function resize() {
    if (signal.aborted) return;
    const [width, height] = tour.stage.aspect.split(':').map(Number);
    const availableWidth = viewport.clientWidth || 640;
    const availableHeight = viewport.clientHeight || 360;
    stageWidth = Math.min(availableWidth, (availableHeight * width) / height);
    stageHeight = (stageWidth * height) / width;
    stage.style.width = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;
    render();
  }
  root.style.setProperty('--tour-accent', tour.style.accent);
  root.style.setProperty('--tour-text', tour.style.text);
  root.style.setProperty('--tour-surface', tour.style.surface);
  stage.style.background = tour.stage.background;
  return {
    resize,
    openContents: navigationController.openContents,
    show(slide, isEnd) {
      if (signal.aborted) return;
      current = slide;
      ended = isEnd;
      hintController.reset();
      navigationController.reset(ended);
      render();
    },
  };
}

function endSlide(tour, labels) {
  const end = tour.endScreen;
  return {
    kind: 'navigation',
    title: end.title,
    description: end.description,
    background: { color: tour.stage.background, image: null },
    buttons: [
      ...(end.button
        ? [{ label: end.button.label, action: { kind: 'url', url: end.button.url } }]
        : []),
      ...(end.restart ? [{ label: labels.restart, action: { kind: 'restart' } }] : []),
    ],
  };
}
