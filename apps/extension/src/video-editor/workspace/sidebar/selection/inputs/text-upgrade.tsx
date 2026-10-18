import { useEffect, useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import { InspectorActionButton } from '../shared/actions';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import type { VideoProjectAnnotationClip } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { getAnnotationTemplateOptions } from '../annotation/options';
import { SelectInput } from '../shared/controls';
import { InformationDisclosure } from '../../../../../ui/compact-inspector-controls/disclosure';

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
    <div className="space-y-3">
      <InformationDisclosure label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
        <p>{translate('videoEditor.sidebar.textTemplateUpgradeDescription')}</p>
      </InformationDisclosure>
      <div className="sniptale-parameter-stack space-y-3">
        <SelectInput
          label={translate('videoEditor.sidebar.annotationTemplateLabel')}
          value={templateKind}
          disabled={props.disabled}
          onChange={setTemplateKind}
          options={getAnnotationTemplateOptions()}
        />
        <InspectorActionButton
          compact
          tone="primary"
          disabled={props.disabled}
          className="w-full"
          onClick={() => props.onConvertTextClipToAnnotation(props.clipId, templateKind)}
        >
          {translate('videoEditor.sidebar.textTemplateUpgradeAction')}
        </InspectorActionButton>
      </div>
    </div>
  );
}
