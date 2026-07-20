export function dispatchMalformedEditorBootstrapEvent(eventName: string): void {
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: { dataUrl: 'javascript:spoofed', title: 'Spoofed payload' },
    })
  );
}
