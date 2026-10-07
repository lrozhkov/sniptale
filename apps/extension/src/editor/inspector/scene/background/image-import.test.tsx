// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
const io = vi.hoisted(() => ({
  read: vi.fn(),
  select: null as null | ((image: { file: File }, signal: AbortSignal) => Promise<void>),
}));
vi.mock('../../../../composition/background-resources/picker', () => ({
  backgroundActionClassName: '',
  BackgroundImagePicker: (props: { onSelect: typeof io.select }) => {
    io.select = props.onSelect;
    return null;
  },
}));
vi.mock('../../../../platform/media-utils/data-url', () => ({ blobToDataUrl: io.read }));
import { EditorInspectorFrameBackgroundImageEditor } from './image';
it('applies acquired pixels through frame history and refuses a cancelled read', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const patch = vi.fn();
  io.read.mockResolvedValue('data:image/png;base64,prepared');
  try {
    await act(async () =>
      root.render(
        <EditorInspectorFrameBackgroundImageEditor
          frameDraft={DEFAULT_EDITOR_FRAME_SETTINGS}
          frameBackgroundImageFitOptions={[]}
          applyFramePatch={patch}
          onClearBackgroundImage={vi.fn()}
          onPickBackgroundImage={vi.fn()}
        />
      )
    );
    const image = { file: new File(['x'], 'bg.png') };
    await act(async () => io.select!(image, new AbortController().signal));
    expect(patch).toHaveBeenCalledWith({
      backgroundImageData: 'data:image/png;base64,prepared',
      backgroundMode: 'image',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(io.select!(image, controller.signal)).rejects.toThrow();
    expect(patch).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
