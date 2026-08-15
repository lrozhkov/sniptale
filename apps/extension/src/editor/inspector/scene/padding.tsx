import type React from 'react';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import {
  ProductGlassLinkedPaddingFields,
  ProductGlassRange,
  type ProductGlassLinkedPaddingValue,
} from '@sniptale/ui/product-glass-controls';
import { NumericValueField } from '../../chrome/ui';
import { PanelSection } from './shared';

function selectFramePadding(frame: EditorFrameSettings): ProductGlassLinkedPaddingValue {
  return {
    top: frame.paddingTop,
    right: frame.paddingRight,
    bottom: frame.paddingBottom,
    left: frame.paddingLeft,
  };
}

function updateFramePadding(
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>,
  padding: ProductGlassLinkedPaddingValue
) {
  setFrameDraft((frameDraft) => ({
    ...frameDraft,
    paddingTop: padding.top,
    paddingRight: padding.right,
    paddingBottom: padding.bottom,
    paddingLeft: padding.left,
  }));
}

export function FramePaddingFields(props: {
  frameDraft: EditorFrameSettings;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
}) {
  return (
    <ProductGlassLinkedPaddingFields
      labels={{
        padding: translate('highlighter.editor.paddingLabel'),
        top: translate('highlighter.editor.paddingTop'),
        right: translate('highlighter.editor.paddingRight'),
        bottom: translate('highlighter.editor.paddingBottom'),
        left: translate('highlighter.editor.paddingLeft'),
        link: translate('highlighter.editor.paddingLinked'),
        unlink: translate('highlighter.editor.paddingSeparate'),
      }}
      padding={selectFramePadding(props.frameDraft)}
      onChange={(padding) => updateFramePadding(props.setFrameDraft, padding)}
      renderUniformField={({ onChange, value }) => (
        <ProductGlassRange
          aria-label={translate('highlighter.editor.paddingLabel')}
          max={512}
          min={0}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          step={4}
          value={value}
        />
      )}
      renderValueField={({ compact, label, onChange, side, value }) => (
        <div className="min-w-0" data-padding-side={side}>
          <NumericValueField
            className={compact ? '!h-7 !w-[4.75rem] !px-1' : '!w-full'}
            label={label}
            max={512}
            min={0}
            onCommitValue={onChange}
            onPreviewValue={onChange}
            unit="px"
            value={value}
          />
        </div>
      )}
    />
  );
}

export function FramePaddingSection(props: {
  frameDraft: EditorFrameSettings;
  framePaddingSummary?: string;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
}) {
  return (
    <PanelSection label={translate('editor.scene.scenePaddingSection')}>
      <FramePaddingFields frameDraft={props.frameDraft} setFrameDraft={props.setFrameDraft} />
    </PanelSection>
  );
}
