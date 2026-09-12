(() => {
  const dialog = globalThis.document.querySelector('[data-guide-viewer]');
  if (!(dialog instanceof globalThis.HTMLDialogElement) || typeof dialog.showModal !== 'function')
    return;
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  const zoom = dialog.querySelector('[data-zoom]');
  let trigger;
  for (const button of globalThis.document.querySelectorAll('[data-guide-open]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const source = globalThis.document.getElementById(button.dataset.guideOpen);
      if (!source) return;
      image.src = source.getAttribute('href');
      image.alt = button.dataset.alt;
      caption.textContent = button.dataset.caption;
      dialog.dataset.zoom = 'fit';
      zoom.setAttribute('aria-pressed', 'false');
      trigger = button;
      dialog.showModal();
    });
  }
  zoom.addEventListener('click', () => {
    const full = dialog.dataset.zoom !== 'full';
    dialog.dataset.zoom = full ? 'full' : 'fit';
    zoom.setAttribute('aria-pressed', String(full));
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    trigger?.focus();
  });
})();

(() => {
  const root = globalThis.document.querySelector('.guide-reading-layout');
  if (!root || root.dataset.readingMode !== 'steps') return;
  const links = [...root.querySelectorAll('[data-guide-target]')];
  const items = [...root.querySelectorAll('[data-guide-page]')];
  const pager = globalThis.document.querySelector('[data-guide-pagination]');
  if (!links.length || !pager) return;
  const previous = pager.querySelector('[data-guide-previous]');
  const next = pager.querySelector('[data-guide-next]');
  const progress = pager.querySelector('[data-guide-progress]');
  let index = 0;
  const select = (id, focus) => {
    const selected = links.findIndex((link) => link.dataset.guideTarget === id);
    if (selected < 0) return;
    index = selected;
    for (const item of items) item.hidden = item.dataset.guidePage !== id;
    for (const link of links) {
      if (link.dataset.guideTarget === id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    previous.disabled = index === 0;
    next.disabled = index === links.length - 1;
    progress.textContent = `${index + 1} / ${links.length}`;
    root.querySelector('.guide-html-content').scrollTop = 0;
    if (focus) items.find((item) => !item.hidden)?.focus({ preventScroll: true });
    links[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const fromHash = () => {
    try {
      const id = decodeURIComponent(globalThis.location.hash.slice(1));
      const item = items.find((item) => item.id === id);
      return item?.dataset.guidePage;
    } catch {
      return undefined;
    }
  };
  const go = (id) => {
    select(id, true);
    globalThis.location.hash = encodeURIComponent(id);
  };
  for (const link of links)
    link.addEventListener('click', (event) => {
      event.preventDefault();
      go(link.dataset.guideTarget);
    });
  const move = (delta) => {
    const link = links[index + delta];
    if (link) go(link.dataset.guideTarget);
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  globalThis.addEventListener('hashchange', () => select(fromHash(), false));
  globalThis.document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      globalThis.document.querySelector('dialog[open]') ||
      event.target.closest('input,textarea,select,[contenteditable]')
    )
      return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  select(fromHash() ?? links[0].dataset.guideTarget, false);
  pager.hidden = false;
})();
