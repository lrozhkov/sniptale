import { useRef } from 'react';
import type {
  CalloutAnchor,
  CalloutPreset,
  CalloutSettings,
  CalloutSettingsPatch,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CalloutManualSettings } from './inspector';
import { CalloutSettingsPositionGrid } from './position-grid';
import { CalloutPresetPreview } from './thumbnail';
import { useCalloutPresetEditorDraft } from './draft';
import { usePresetEditorModalLifecycle } from '../modal-lifecycle';
import { Eye } from 'lucide-react';
import { editorInputClassName, editorPreviewFrameClassName } from '../constants';

function getPresetPlacement(anchor: CalloutAnchor): CalloutPreset['placement'] {
  if (anchor === 'middle-left') return { anchor, side: 'left' };
  if (anchor === 'middle-right') return { anchor, side: 'right' };
  if (anchor.startsWith('bottom')) return { anchor, side: 'bottom' };
  return { anchor, side: 'top' };
}

function applyStylePatch(style: CalloutVisualStyle, patch: CalloutSettingsPatch) {
  return {
    accentEdge: { ...style.accentEdge, ...patch.style?.accentEdge },
    badge: { ...style.badge, ...patch.style?.badge },
    colorBindings: { ...style.colorBindings, ...patch.style?.colorBindings },
    connector: {
      ...style.connector,
      ...patch.style?.connector,
      cornerStyle: { ...style.connector.cornerStyle, ...patch.style?.connector?.cornerStyle },
      curve: { ...style.connector.curve, ...patch.style?.connector?.curve },
      spacing: { ...style.connector.spacing, ...patch.style?.connector?.spacing },
    },
    customCss: patch.style?.customCss ?? style.customCss,
    surface: { ...style.surface, ...patch.style?.surface },
    title: { ...style.title, ...patch.style?.title },
    typography: { ...style.typography, ...patch.style?.typography },
  };
}

function createInspectorSettings(
  placement: CalloutPreset['placement'],
  style: CalloutVisualStyle
): CalloutSettings {
  return {
    content: { bodyHtml: '', titleText: '' },
    enabled: true,
    placement,
    style,
  };
}

type CalloutPresetEditorProps = {
  isOpen: boolean;
  isNew?: boolean;
  isSaving: boolean;
  preset: CalloutPreset;
  onClose: () => void;
  onReset?: (() => void | Promise<void>) | undefined;
  onSave: (preset: CalloutPreset) => void | Promise<void>;
};

function PresetEditorBody(props: {
  name: string;
  placement: CalloutPreset['placement'];
  setName: (value: string) => void;
  setPlacement: (value: CalloutPreset['placement']) => void;
  setStyle: (value: CalloutVisualStyle) => void;
  style: CalloutVisualStyle;
}) {
  return (
    <ProductModalBody compact className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.calloutPresets.editor.name')}
        </label>
        <input
          className={[
            editorInputClassName,
            'cursor-text placeholder:text-[var(--sniptale-color-text-dim)]',
          ].join(' ')}
          maxLength={64}
          onChange={(event) => props.setName(event.target.value)}
          type="text"
          value={props.name}
        />
      </div>
      <div
        className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)]"
        data-ui="shared.callout-preset-editor.layout"
      >
        <div className="flex-shrink-0" data-ui="shared.callout-preset-editor.preview-panel">
          <div className="mb-2 flex items-center gap-1 text-xs text-[var(--sniptale-color-text-secondary)]">
            <Eye aria-hidden="true" size={12} />
            {translate('highlighter.editor.previewLabel')}
          </div>
          <div className={`${editorPreviewFrameClassName} flex items-center justify-center`}>
            <CalloutPresetPreview editor placement={props.placement} style={props.style} />
          </div>
        </div>
        <CalloutManualSettings
          settings={createInspectorSettings(props.placement, props.style)}
          positionSection={
            <div className="grid gap-2" data-ui="shared.callout-preset-editor.position">
              <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
                {translate('highlighter.calloutPresets.editor.defaultPosition')}
              </div>
              <CalloutSettingsPositionGrid
                anchor={props.placement.anchor}
                layout="square"
                onChange={(anchor) =>
                  props.setPlacement({
                    ...getPresetPlacement(anchor),
                    connectorAttachments: props.placement.connectorAttachments ?? {
                      block: { mode: 'auto' },
                      frame: { mode: 'auto' },
                    },
                  })
                }
              />
            </div>
          }
          onChange={(patch) => props.setStyle(applyStylePatch(props.style, patch))}
        />
      </div>
    </ProductModalBody>
  );
}

function PresetEditorFooter(props: {
  canReset: boolean;
  isSaving: boolean;
  name: string;
  onClose: () => void;
  onReset?: (() => void | Promise<void>) | undefined;
  onSave: () => void;
}) {
  return (
    <ProductModalFooter compact>
      {props.canReset && props.onReset ? (
        <ProductActionButton
          tone="secondary"
          disabled={props.isSaving}
          onClick={() => void props.onReset?.()}
        >
          {translate('highlighter.calloutPresets.reset')}
        </ProductActionButton>
      ) : null}
      <ProductActionButton tone="secondary" onClick={props.onClose}>
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        tone="primary"
        disabled={!props.name.trim() || props.isSaving}
        onClick={props.onSave}
      >
        {translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function CalloutPresetEditor(props: CalloutPresetEditorProps) {
  const locale = useAppLocale();
  const modalRootRef = useRef<HTMLDivElement>(null);
  const source = props.preset;
  const draft = useCalloutPresetEditorDraft({ isOpen: props.isOpen, locale, source });
  usePresetEditorModalLifecycle({
    isOpen: props.isOpen && Boolean(draft.style && draft.preset),
    modalRootRef,
    onClose: props.onClose,
  });
  if (!props.isOpen || !draft.style || !draft.preset) return null;
  const preset = draft.preset;
  return (
    <div ref={modalRootRef} style={{ display: 'contents' }}>
      <ProductModal
        dialogClassName="sniptale-highlighter-preset-editor-dialog"
        isOpen
        width="660px"
        maxWidth="94vw"
        maxHeight="86vh"
        scrollable
        onClose={props.onClose}
      >
        <ProductModalHeader
          compact
          title={translate(
            props.isNew
              ? 'highlighter.calloutPresets.editor.newTitle'
              : 'highlighter.calloutPresets.editor.editTitle'
          )}
          onClose={props.onClose}
        />
        <PresetEditorBody
          name={draft.name}
          placement={draft.placement}
          setName={draft.setName}
          setPlacement={draft.setPlacement}
          setStyle={draft.setStyle}
          style={draft.style}
        />
        <PresetEditorFooter
          canReset={source.origin === 'system' && source.customized === true}
          isSaving={props.isSaving}
          name={draft.name}
          onClose={props.onClose}
          {...(props.onReset ? { onReset: props.onReset } : {})}
          onSave={() => void props.onSave(preset)}
        />
      </ProductModal>
    </div>
  );
}
