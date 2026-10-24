/** jsdom needs only the native dialog open state for component tests. */
export function stubTourPreviewDialog() {
  const prototype = HTMLDialogElement.prototype;
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(prototype, name)] as const
  );
  prototype.showModal = function () {
    this.open = true;
  };
  prototype.close = function () {
    this.open = false;
  };
  return () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else Reflect.deleteProperty(prototype, name);
    }
  };
}
