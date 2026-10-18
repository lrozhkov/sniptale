const root = document.documentElement;
root.dataset.inputMode = 'pointer';
document.addEventListener('pointerdown', () => (root.dataset.inputMode = 'pointer'), true);
document.addEventListener(
  'keydown',
  (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    const editable =
      event.target instanceof Element &&
      event.target.closest('input,textarea,[contenteditable=true]');
    if (event.key === 'Tab' || (!editable && !event.ctrlKey && !event.metaKey && !event.altKey))
      root.dataset.inputMode = 'keyboard';
  },
  true
);
