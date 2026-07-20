// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  dataTransferMayContainFilePayload,
  getImageFileFromClipboardEvent,
  getImageFileFromDataTransfer,
  isEditablePasteTarget,
} from './intake';
import { createFileDragTransfer, createImageFile, createTextFile } from './test-support';

function createClipboardEvent(args: {
  files?: File[];
  items?: Array<{ file: File | null; type: string }>;
  target?: EventTarget | null;
}) {
  const event = new Event('paste', { bubbles: true }) as ClipboardEvent;
  const items =
    args.items?.map((item) => ({
      getAsFile: () => item.file,
      kind: 'file',
      type: item.type,
    })) ?? [];

  Object.defineProperties(event, {
    clipboardData: {
      value: {
        files: args.files ?? [],
        items,
      },
    },
    target: {
      value: args.target ?? null,
    },
  });

  return event;
}

describe('canvas-wrapper dropped image intake', () => {
  it('extracts the first image file from dropped files and ignores non-image payloads', () => {
    const textFile = createTextFile();
    const imageFile = createImageFile('capture.png');

    expect(
      getImageFileFromDataTransfer(createFileDragTransfer({ files: [textFile, imageFile] }))
    ).toBe(imageFile);
    expect(getImageFileFromDataTransfer(createFileDragTransfer({ files: [textFile] }))).toBeNull();
    expect(getImageFileFromDataTransfer(null)).toBeNull();
  });

  it('detects browser file drags before the dropped files are readable', () => {
    expect(dataTransferMayContainFilePayload(createFileDragTransfer({ pending: true }))).toBe(true);
    expect(dataTransferMayContainFilePayload(createFileDragTransfer())).toBe(false);
  });
});

describe('canvas-wrapper pasted image intake', () => {
  it('extracts image files from clipboard items before falling back to clipboard files', () => {
    const itemImage = createImageFile('clipboard-item.webp', 'image/webp');
    const fallbackImage = createImageFile('clipboard-file.png');

    expect(
      getImageFileFromClipboardEvent(
        createClipboardEvent({
          files: [fallbackImage],
          items: [{ file: itemImage, type: itemImage.type }],
        })
      )
    ).toBe(itemImage);

    expect(getImageFileFromClipboardEvent(createClipboardEvent({ files: [fallbackImage] }))).toBe(
      fallbackImage
    );
  });

  it('ignores paste events from interactive targets and non-image clipboard payloads', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(isEditablePasteTarget(input)).toBe(true);
    expect(isEditablePasteTarget(button)).toBe(true);
    expect(isEditablePasteTarget(select)).toBe(true);
    expect(isEditablePasteTarget(editable)).toBe(true);
    expect(getImageFileFromClipboardEvent(createClipboardEvent({ target: input }))).toBeNull();
    expect(
      getImageFileFromClipboardEvent(
        createClipboardEvent({
          files: [createTextFile()],
          target: document.createElement('div'),
        })
      )
    ).toBeNull();
  });
});
