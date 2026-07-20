// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VideoEditorFileInputRefs } from './file-inputs';
import { VideoEditorFileInputNodes } from './file-inputs';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderInputs(props: React.ComponentProps<typeof VideoEditorFileInputNodes>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<VideoEditorFileInputNodes {...props} />);
  });
}

function dispatchFileChange(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('video editor file input nodes', () => {
  it('forwards selected files and clears the input value', () => {
    const imageInputRef: VideoEditorFileInputRefs['imageInputRef'] = { current: null };
    const videoInputRef: VideoEditorFileInputRefs['videoInputRef'] = { current: null };
    const audioInputRef: VideoEditorFileInputRefs['audioInputRef'] = { current: null };
    const onImportImage = vi.fn();

    renderInputs({
      audioInputRef,
      imageInputRef,
      videoInputRef,
      onImportAudio: vi.fn(),
      onImportImage,
      onImportVideo: vi.fn(),
    });

    const imageInput = imageInputRef.current;
    expect(imageInput).toBeInstanceOf(HTMLInputElement);
    if (!imageInput) {
      throw new Error('Expected image input ref');
    }

    dispatchFileChange(imageInput, new File(['image'], 'image.png'));

    expect(onImportImage).toHaveBeenCalledWith(expect.any(File));
    expect(imageInput.value).toBe('');
  });
});
