export function bindSelectAllOnFocus(input) {
  let pendingRelease = false;
  function select() {
    if (!input.disabled && !input.readOnly) {
      input.select();
      pendingRelease = true;
    }
  }
  input.addEventListener('pointerdown', () => {
    if (document.activeElement === input) pendingRelease = false;
  });
  input.addEventListener('focus', select);
  input.addEventListener('mouseup', (event) => {
    if (pendingRelease) {
      event.preventDefault();
      input.select();
      pendingRelease = false;
    }
  });
  input.addEventListener('keydown', () => (pendingRelease = false));
  input.addEventListener('input', () => (pendingRelease = false));
  return select;
}
