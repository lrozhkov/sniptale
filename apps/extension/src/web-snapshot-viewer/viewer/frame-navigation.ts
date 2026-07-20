export function blockSnapshotFrameNavigation(iframe: HTMLIFrameElement | null): void {
  const doc = iframe?.contentDocument;
  if (!doc) {
    return;
  }

  doc.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  doc.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (target) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );
}
