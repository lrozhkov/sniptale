export function bindFieldLabel(label, input) {
  // Keep one activation decision before native label focus can blur and reopen the input.
  label.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
  label.addEventListener('click', (event) => {
    event.preventDefault();
    if (input.disabled) return;
    if (document.activeElement === input) input.blur();
    else input.focus();
  });
}
