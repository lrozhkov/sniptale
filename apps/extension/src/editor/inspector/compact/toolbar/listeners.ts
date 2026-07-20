export function registerCompactToolbarEffectListeners(
  updateLayout: () => void,
  handleClickOutside: (event: MouseEvent) => void,
  handleEscape: (event: KeyboardEvent) => void
) {
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleEscape);
  window.addEventListener('resize', updateLayout);
  window.addEventListener('scroll', updateLayout, true);

  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);
    window.removeEventListener('resize', updateLayout);
    window.removeEventListener('scroll', updateLayout, true);
  };
}
