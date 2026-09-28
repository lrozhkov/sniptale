import type React from 'react';
import { useState } from 'react';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import {
  ProductGlassLinkedPaddingFields,
  type ProductGlassLinkedPaddingValue,
} from '@sniptale/ui/product-glass-controls';
import { NumericRow } from '../../chrome/ui';
import { PanelSection } from './shared';

type PaddingHoverSide = keyof ProductGlassLinkedPaddingValue | 'all';

function readPaddingHoverSide(target: EventTarget | null): PaddingHoverSide | null {
  const value =
    target instanceof Element
      ? target.closest<HTMLElement>('[data-padding-hover]')?.dataset['paddingHover']
      : null;
  switch (value) {
    case 'all':
    case 'top':
    case 'right':
    case 'bottom':
    case 'left':
      return value;
    case null:
    case undefined:
    default:
      return null;
  }
}

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
  const [hoveredSide, setHoveredSide] = useState<PaddingHoverSide | null>(null);
  const [focusedSide, setFocusedSide] = useState<PaddingHoverSide | null>(null);
  return (
    <div
      onPointerMoveCapture={(event) => setHoveredSide(readPaddingHoverSide(event.target))}
      onPointerLeave={() => setHoveredSide(null)}
      onFocusCapture={(event) => setFocusedSide(readPaddingHoverSide(event.target))}
      onBlurCapture={(event) => setFocusedSide(readPaddingHoverSide(event.relatedTarget))}
    >
      <ProductGlassLinkedPaddingFields
        fieldLayout="inline"
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
            <PaddingValue
              label={label}
              value={value}
              onChange={onChange}
              side={side}
              revealSlider={hoveredSide === side || focusedSide === side}
            />
          </div>
        )}
      />
    </div>
  );
}

function PaddingValue(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  side: PaddingHoverSide;
  revealSlider: boolean;
}) {
  return (
    <div className="min-w-0" data-padding-hover={props.side}>
      <NumericRow
        labelVisible={false}
        label={props.label}
        max={4096}
        min={0}
        onCommitValue={props.onChange}
        onPreviewValue={props.onChange}
        unit="px"
        value={props.value}
        scrub={{ min: 0, max: 256, step: 1, value: Math.min(256, props.value) }}
        revealScrub={props.revealSlider}
      />
    </div>
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
