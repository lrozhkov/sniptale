const EDITABLE_PASTE_TARGET_SELECTOR =
  'input, textarea, select, button, [contenteditable]:not([contenteditable="false"])';

function isImageFile(file: File | null | undefined): file is File {
  return Boolean(file?.type.toLowerCase().startsWith('image/'));
}

function getFirstImageFile(files: FileList | File[] | null | undefined): File | null {
  return Array.from(files ?? []).find(isImageFile) ?? null;
}

function getImageFileFromItems(items: DataTransferItemList | null | undefined): File | null {
  for (const item of Array.from(items ?? [])) {
    if (item.kind === 'file' && item.type.toLowerCase().startsWith('image/')) {
      const file = item.getAsFile();
      if (isImageFile(file)) {
        return file;
      }
    }
  }

  return null;
}

function dataTransferTypesIncludeFiles(types: readonly string[] | DOMStringList | undefined) {
  return Array.from(types ?? []).includes('Files');
}

function dataTransferItemsIncludeFile(items: DataTransferItemList | null | undefined) {
  return Array.from(items ?? []).some((item) => item.kind === 'file');
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.matches(EDITABLE_PASTE_TARGET_SELECTOR) ||
    Boolean(target.closest(EDITABLE_PASTE_TARGET_SELECTOR))
  );
}

export function getImageFileFromDataTransfer(dataTransfer: DataTransfer | null): File | null {
  return getImageFileFromItems(dataTransfer?.items) ?? getFirstImageFile(dataTransfer?.files);
}

export function dataTransferMayContainFilePayload(dataTransfer: DataTransfer | null): boolean {
  return (
    dataTransferTypesIncludeFiles(dataTransfer?.types) ||
    dataTransferItemsIncludeFile(dataTransfer?.items) ||
    Boolean(dataTransfer?.files?.length)
  );
}

export function getImageFileFromClipboardEvent(event: ClipboardEvent): File | null {
  if (isEditablePasteTarget(event.target)) {
    return null;
  }

  return (
    getImageFileFromItems(event.clipboardData?.items) ??
    getFirstImageFile(event.clipboardData?.files)
  );
}
