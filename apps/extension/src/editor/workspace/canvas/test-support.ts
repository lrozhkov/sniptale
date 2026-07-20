import { vi } from 'vitest';

interface FileDragTransferOptions {
  files?: File[];
  pending?: boolean;
}

interface ReactFileDragEventOptions extends FileDragTransferOptions {
  currentTarget?: HTMLElement;
  relatedTarget?: EventTarget | null;
}

export function createImageFile(name = 'image.png', type = 'image/png'): File {
  return new File(['image'], name, { type });
}

export function createTextFile(name = 'notes.txt'): File {
  return new File(['notes'], name, { type: 'text/plain' });
}

export function createFileDragTransfer(options: FileDragTransferOptions = {}): DataTransfer {
  const files = options.files ?? [];
  return {
    files: files as unknown as FileList,
    items: files.map((file) => ({
      getAsFile: () => file,
      kind: 'file',
      type: file.type,
    })) as unknown as DataTransferItemList,
    types: options.pending || files.length > 0 ? ['Files'] : [],
  } as unknown as DataTransfer;
}

export function createDomFileDragEvent(
  type: 'dragover' | 'dragleave' | 'drop',
  options: FileDragTransferOptions = {}
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: createFileDragTransfer(options),
  });
  return event;
}

export function createReactFileDragEvent(options: ReactFileDragEventOptions = {}) {
  return {
    currentTarget: options.currentTarget ?? document.createElement('div'),
    dataTransfer: createFileDragTransfer(options),
    preventDefault: vi.fn(),
    relatedTarget: options.relatedTarget ?? null,
    stopPropagation: vi.fn(),
  };
}
