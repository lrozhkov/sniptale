import { useEffect, useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import type { VideoProjectAnnotationClip } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { getAnnotationTemplateOptions } from '../annotation/options';
import { SelectInput } from '../shared/controls';
import { PANEL_HEADING_CLASS_NAME, PANEL_META_CLASS_NAME } from '../shared/panel';

export function TextTemplateUpgradeFields(props: {
  clipId: string;
  disabled: boolean;
  onConvertTextClipToAnnotation: NonNullable<
    WorkspaceSidebarProps['onConvertTextClipToAnnotation']
  >;
}) {
  const [templateKind, setTemplateKind] = useState<VideoProjectAnnotationClip['templateKind']>(
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC
  );

  useEffect(() => {
    setTemplateKind(VideoOverlayTemplateKind.LOWER_THIRD_BASIC);
  }, [props.clipId]);

  return (
    <div
      className="space-y-3 border-t
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)] pt-3"
    >
      <p className={PANEL_HEADING_CLASS_NAME}>
        {translate('videoEditor.sidebar.textTemplateUpgradeLabel')}
      </p>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>
        {translate('videoEditor.sidebar.textTemplateUpgradeDescription')}
      </p>
      <div className="space-y-3">
        <SelectInput
          label={translate('videoEditor.sidebar.annotationTemplateLabel')}
          value={templateKind}
          disabled={props.disabled}
          onChange={setTemplateKind}
          options={getAnnotationTemplateOptions()}
        />
        <ProductActionButton
          compact
          tone="primary"
          disabled={props.disabled}
          className="w-full"
          onClick={() => props.onConvertTextClipToAnnotation(props.clipId, templateKind)}
        >
          {translate('videoEditor.sidebar.textTemplateUpgradeAction')}
        </ProductActionButton>
      </div>
    </div>
  );
}
