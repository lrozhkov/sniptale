import { describe, expectTypeOf, it } from 'vitest';

import type { VideoEditorFileInputRefs } from '../../chrome/file-inputs';
import type { VideoEditorLibraryPanelBodyProps, VideoEditorLibraryPanelProps } from './panel';

describe('video editor library panel contracts', () => {
  it('keeps panel props independent from workspace sidebar props', () => {
    expectTypeOf<VideoEditorLibraryPanelProps>().toMatchTypeOf<{
      isOpen: boolean;
      onClose: () => void;
      onImportImage: (file: File) => void;
      recordingId: string | null;
    }>();
    expectTypeOf<
      VideoEditorLibraryPanelBodyProps['inputRefs']
    >().toEqualTypeOf<VideoEditorFileInputRefs>();
  });
});
