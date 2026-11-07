import type React from 'react';
import { useState } from 'react';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import {
  ProductGlassLinkedPaddingFields,
  type ProductGlassLinkedPaddingValue,
} from '@sniptale/ui/product-glass-controls';
import { NumericRangeScrub } from '../../../ui/compact-inspector-controls';
import { NumericRow, NumericValueField } from '../../chrome/ui';
import { PanelSection, useInspectorNumericDraft } from './shared';

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
  previewFrameDraft?: React.Dispatch<React.SetStateAction<EditorFrameSettings>> | undefined;
}) {
  const previewFrameDraft = props.previewFrameDraft;
  const [hoveredSide, setHoveredSide] = useState<PaddingHoverSide | null>(null);
  const [focusedSide, setFocusedSide] = useState<PaddingHoverSide | null>(null);
  const [rangeActive, setRangeActive] = useState(false);
  return (
    <div
      className="relative"
      data-ui="editor.frame.padding-fields"
      onPointerMoveCapture={(event) => setHoveredSide(readPaddingHoverSide(event.target))}
      onPointerLeave={() => setHoveredSide(null)}
      onFocusCapture={(event) => setFocusedSide(readPaddingHoverSide(event.target))}
      onBlurCapture={(event) => setFocusedSide(readPaddingHoverSide(event.relatedTarget))}
    >
      <ProductGlassLinkedPaddingFields
        fieldLayout="full-row"
        labels={{
          padding: translate('editor.scene.paddingAroundImage'),
          top: translate('highlighter.editor.paddingTop'),
          right: translate('highlighter.editor.paddingRight'),
          bottom: translate('highlighter.editor.paddingBottom'),
          left: translate('highlighter.editor.paddingLeft'),
          link: translate('highlighter.editor.paddingLinked'),
          unlink: translate('highlighter.editor.paddingSeparate'),
        }}
        padding={selectFramePadding(props.frameDraft)}
        onPreviewChange={
          previewFrameDraft
            ? (padding) => updateFramePadding(previewFrameDraft, padding)
            : undefined
        }
        onChange={(padding) => updateFramePadding(props.setFrameDraft, padding)}
        renderUniformField={({ onChange, onPreview, value }) => (
          <div
            className="pointer-events-none relative h-2"
            data-ui="editor.frame.padding-slider"
            data-padding-hover="all"
          >
            <PaddingRange
              active={rangeActive}
              label={translate('editor.scene.paddingAroundImage')}
              onActiveChange={setRangeActive}
              onPreview={onPreview}
              onChange={onChange}
              value={value}
              visible={
                rangeActive ||
                hoveredSide === 'all' ||
                hoveredSide === 'top' ||
                focusedSide === 'top'
              }
            />
          </div>
        )}
        renderValueField={({ compact, label, onChange, onPreview, side, value }) => (
          <div className="min-w-0" data-padding-side={side}>
            <PaddingValue
              compact={compact}
              label={label}
              value={value}
              onPreview={onPreview}
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

function PaddingRange(props: {
  active: boolean;
  label: string;
  onActiveChange: (active: boolean) => void;
  onChange: (value: number) => void;
  onPreview?: ((value: number) => void) | undefined;
  value: number;
  visible: boolean;
}) {
  const draft = useInspectorNumericDraft(props.value, props.onChange, props.onPreview);
  return <NumericRangeScrub {...props} {...draft} scrub={{ min: 0, max: 256, step: 1 }} />;
}

function PaddingValue(props: {
  compact: boolean;
  label: string;
  value: number;
  onChange: (value: number) => void;
  onPreview?: ((value: number) => void) | undefined;
  side: PaddingHoverSide;
  revealSlider: boolean;
}) {
  const draft = useInspectorNumericDraft(props.value, props.onChange, props.onPreview);
  return (
    <div className="min-w-0" data-padding-hover={props.side}>
      {props.compact ? (
        <NumericValueField
          className="w-full!"
          focusAppearance="accent-box"
          label={props.label}
          max={4096}
          min={0}
          {...draft}
          unit="px"
        />
      ) : (
        <NumericRow
          label={props.label}
          max={4096}
          min={0}
          {...draft}
          unit="px"
          scrub={{ min: 0, max: 256, step: 1, value: Math.min(256, draft.value) }}
          revealScrub={props.revealSlider}
        />
      )}
    </div>
  );
}

export function FramePaddingSection(props: {
  frameDraft: EditorFrameSettings;
  framePaddingSummary?: string;
  hideHeader?: boolean;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  previewFrameDraft?: React.Dispatch<React.SetStateAction<EditorFrameSettings>> | undefined;
}) {
  return (
    <PanelSection
      label={translate('editor.scene.scenePaddingSection')}
      hideHeader={props.hideHeader ?? false}
    >
      <FramePaddingFields
        frameDraft={props.frameDraft}
        setFrameDraft={props.setFrameDraft}
        previewFrameDraft={props.previewFrameDraft}
      />
    </PanelSection>
  );
}
