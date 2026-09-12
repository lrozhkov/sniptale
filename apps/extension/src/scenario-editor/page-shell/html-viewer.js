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
