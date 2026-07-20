import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import { ContentSizeTooltip } from '@sniptale/ui/content-size-tooltip';
import type { ContentSizeTooltipProps } from '@sniptale/ui/content-size-tooltip/types';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';

const noop = () => {};

function buildContentSizeTooltipPreviewHandlers() {
  return {
    onCancel: noop,
    onConfirm: noop,
    onHeightChangeCommit: noop,
    onHeightChangeRaw: noop,
    onHeightDecrease: noop,
    onHeightIncrease: noop,
    onToggleAspectRatio: noop,
    onWidthChangeCommit: noop,
    onWidthChangeRaw: noop,
    onWidthDecrease: noop,
    onWidthIncrease: noop,
  };
}

function buildContentSizeTooltipPreviewProps(
  copy: ReturnType<typeof getSharedPreviewCopy>
): ContentSizeTooltipProps {
  return {
    copy: {
      widthField: copy.widthField,
      heightField: copy.heightField,
      decreaseWidth: copy.decreaseWidth,
      increaseWidth: copy.increaseWidth,
      decreaseHeight: copy.decreaseHeight,
      increaseHeight: copy.increaseHeight,
      keepAspectRatio: copy.keepAspectRatio,
      cancel: copy.close,
      confirm: copy.apply,
    },
    heightMax: 1080,
    heightMin: 80,
    heightValue: 360,
    maintainAspectRatio: true,
    portalTheme: 'dark',
    position: { x: 24, y: 24 },
    widthMax: 1920,
    widthMin: 80,
    widthValue: 640,
    ...buildContentSizeTooltipPreviewHandlers(),
  };
}

export function buildContentSizeTooltipSharedPreviews(
  locale: AppLocale
): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);
  const previewProps = buildContentSizeTooltipPreviewProps(copy);

  return [
    designSystemPreview(
      'shared.ui.content-size-tooltip',
      'floating',
      <DesignSystemFloatingPreviewFrame minHeight={124}>
        <ContentSizeTooltip {...previewProps} />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
