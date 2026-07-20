import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../../../features/editor/document/constants';
import { type EditorFrameSettings } from '../../../../../../features/editor/document/types';
import { useEditorStore } from '../../../../../state/useEditorStore';
import type { OpenImageOptions } from '../../../../core/types';

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

export interface EditorOpenImageContext {
  browserFrame: EditorStoreState['browserFrame'];
  browserFrameUrl: string;
  frame: EditorFrameSettings;
  pageTitle: string;
  sourceFaviconUrl: string | null;
}

function resolveOpenedImageFrame(frame: EditorStoreState['frame']): EditorFrameSettings {
  return {
    ...frame,
    layoutMode: 'fit-image',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    backgroundMode: 'color',
    backgroundColor: 'transparent',
    // Fresh image open starts as a clean document; scene-tool defaults stay in preset storage.
    backgroundGradientFrom: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom,
    backgroundGradientTo: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo,
    backgroundGradientAngle: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
    backgroundImageData: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageData,
    backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
  };
}

export async function resolveEditorOpenImageContext(
  openOptions: OpenImageOptions
): Promise<EditorOpenImageContext> {
  const store = useEditorStore.getState();

  return {
    browserFrame: store.browserFrame,
    browserFrameUrl: openOptions.browserFrameUrl ?? store.browserFrame.url,
    frame: resolveOpenedImageFrame(store.frame),
    pageTitle: openOptions.pageTitle ?? '',
    sourceFaviconUrl: openOptions.sourceFaviconUrl ?? null,
  };
}
