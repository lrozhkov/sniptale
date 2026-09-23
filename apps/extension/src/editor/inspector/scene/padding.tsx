import type React from 'react';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import {
  ProductGlassLinkedPaddingFields,
  type ProductGlassLinkedPaddingValue,
} from '@sniptale/ui/product-glass-controls';
import { NumericRow } from '../../chrome/ui';
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
      renderValueField={({ label, onChange, side, value }) => (
        <div className="min-w-0" data-padding-side={side}>
          <NumericRow
            labelVisible={false}
            scrub={{ min: 0, max: 512, step: 4 }}
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
  hideHeader?: boolean;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
}) {
  return (
    <PanelSection
      label={translate('editor.scene.scenePaddingSection')}
      hideHeader={props.hideHeader ?? false}
    >
      <FramePaddingFields frameDraft={props.frameDraft} setFrameDraft={props.setFrameDraft} />
    </PanelSection>
  );
}
