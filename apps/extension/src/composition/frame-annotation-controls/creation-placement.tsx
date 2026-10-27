import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import type { StandaloneAnnotationCreationOptions } from '../../features/highlighter/contracts';
import { translate } from '../../platform/i18n';

export interface AnnotationPlacementControl {
  value: StandaloneAnnotationCreationOptions['placement'];
  onChange: (value: StandaloneAnnotationCreationOptions['placement']) => void;
}

export function AnnotationCreationPlacement(props: AnnotationPlacementControl) {
  return (
    <ContentPopoverSection
      title={translate('content.interactiveFrame.annotationPlacement')}
      dataUi="content.annotation.creation-placement"
    >
      <SegmentedSwitch
        activeId={props.value}
        ariaLabel={translate('content.interactiveFrame.annotationPlacement')}
        density="compact"
        appearance="neutral"
        options={[
          {
            id: 'element',
            label: translate('content.interactiveFrame.annotationPlacementElement'),
          },
          { id: 'free', label: translate('content.interactiveFrame.annotationPlacementFree') },
        ]}
        onChange={props.onChange}
      />
    </ContentPopoverSection>
  );
}
