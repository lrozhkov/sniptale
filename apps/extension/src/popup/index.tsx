performance.mark('sniptale-popup-entry-evaluated');

const loadPopupApplication = () => void import('./shell/app/entrypoint');

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(loadPopupApplication);
});

export {};
