import { Crop, Info, PanelTop, Scaling } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import type { EditorInspector } from '../../state/types';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import type { CompactSelectOption } from '../../chrome/ui';
import { EditorInspectorGroupSection } from '../grouped';
import { EditorInspectorBrowserFramePanel, EditorInspectorMetaPanel } from '../environment';
import { EditorInspectorResizeToolSection } from './resize-tool';

export type DocumentInspectorMode = Extract<
  EditorInspector,
  'browser-frame' | 'meta' | 'image-size' | 'canvas-size'
>;

interface EditorInspectorDocumentPanelProps {
  inspector: DocumentInspectorMode;
  browserFrame: BrowserFrameState;
  browserCanvasModeOptions: CompactSelectOption<BrowserFrameState['canvasMode']>[];
  browserContentModeOptions: CompactSelectOption<BrowserFrameState['contentMode']>[];
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
  insertOrUpdateBrowserFrame?: (() => Promise<void> | void) | undefined;
  imageSizeText: string;
  canvasSizeText: string;
  canvasSize: { width: number; height: number };
  cropReady: boolean;
  cropSelection: { width: number; height: number } | null;
  imageSizeDraft: { width: number; height: number };
  canvasSizeDraft: { width: number; height: number };
  imageSizeLocked: boolean;
  canvasSizeLocked: boolean;
  imageAspectRatio: number | null;
  canvasAspectRatio: number | null;
  setImageSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setCanvasSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setImageSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setCanvasSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  updateLockedDraft: (
    state: { width: number; height: number },
    field: 'width' | 'height',
    value: number,
    locked: boolean,
    aspectRatio: number | null
  ) => { width: number; height: number };
}

interface DocumentSectionDescriptor {
  content: React.ReactNode;
  icon: LucideIcon;
  label: string;
  meta?: string | undefined;
}

/**
 * The rail already selects the active document category, so the body renders only
 * that section — matching the video inspector's focused active-category pattern
 * rather than stacking disclosure headers for sibling categories.
 */
export function EditorInspectorDocumentPanel(props: EditorInspectorDocumentPanelProps) {
  const controller = useEditorController();
  const section = describeDocumentSection(props.inspector, props, controller);
  const Icon = section.icon;

  return (
    <div data-ui="editor.inspector.sections" data-section={props.inspector}>
      <h3 data-ui="editor.inspector.section-heading" className="sr-only">
        <Icon size={16} aria-hidden="true" />
        <span>{section.label}</span>
      </h3>
      <EditorInspectorGroupSection meta={section.meta}>
        {section.content}
      </EditorInspectorGroupSection>
    </div>
  );
}

function describeDocumentSection(
  mode: DocumentInspectorMode,
  props: EditorInspectorDocumentPanelProps,
  controller: ReturnType<typeof useEditorController>
): DocumentSectionDescriptor {
  switch (mode) {
    case 'browser-frame':
      return {
        content: (
          <EditorInspectorBrowserFramePanel
            browserFrame={props.browserFrame}
            browserCanvasModeOptions={props.browserCanvasModeOptions}
            browserContentModeOptions={props.browserContentModeOptions}
            syncBrowserFrame={props.syncBrowserFrame}
            {...(props.insertOrUpdateBrowserFrame === undefined
              ? {}
              : { insertOrUpdateBrowserFrame: props.insertOrUpdateBrowserFrame })}
          />
        ),
        icon: PanelTop,
        label: translate('editor.toolbar.browserTitle'),
      };
    case 'meta':
      return {
        content: <EditorInspectorMetaPanel />,
        icon: Info,
        label: translate('editor.toolbar.metaTitle'),
      };
    case 'image-size':
      return {
        content: <EditorInspectorResizeToolSection {...resizeProps(props, controller, 'image')} />,
        icon: Scaling,
        label: translate('editor.toolbar.imageSizeTitle'),
      };
    case 'canvas-size':
      return {
        content: <EditorInspectorResizeToolSection {...resizeProps(props, controller, 'canvas')} />,
        icon: Crop,
        label: translate('editor.toolbar.canvasSizeTitle'),
      };
  }
}

function resizeProps(
  props: EditorInspectorDocumentPanelProps,
  controller: ReturnType<typeof useEditorController>,
  mode: 'canvas' | 'image'
) {
  return {
    canvasAspectRatio: props.canvasAspectRatio,
    canvasSize: props.canvasSize,
    canvasSizeDraft: props.canvasSizeDraft,
    canvasSizeLocked: props.canvasSizeLocked,
    canvasSizeText: props.canvasSizeText,
    controller,
    cropReady: props.cropReady,
    cropSelection: props.cropSelection,
    imageAspectRatio: props.imageAspectRatio,
    imageSizeDraft: props.imageSizeDraft,
    imageSizeLocked: props.imageSizeLocked,
    imageSizeText: props.imageSizeText,
    mode,
    setCanvasSizeDraft: props.setCanvasSizeDraft,
    setCanvasSizeLocked: props.setCanvasSizeLocked,
    setImageSizeDraft: props.setImageSizeDraft,
    setImageSizeLocked: props.setImageSizeLocked,
    updateLockedDraft: props.updateLockedDraft,
  };
}
