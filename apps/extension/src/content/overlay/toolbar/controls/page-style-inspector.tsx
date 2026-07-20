import { SlidersHorizontal } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';

const MODE_ICON_CLASS_NAME = 'sniptale-toolbar-mode-icon h-[18px] w-[18px] shrink-0';

export function PageStyleInspectorToolbarButton(props: {
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const title = props.disabled
    ? translate('content.pageStyleInspector.unavailableDuringDocumentEdit')
    : translate(
        props.open
          ? 'content.pageStyleInspector.hideProperties'
          : 'content.pageStyleInspector.showProperties'
      );

  return (
    <ContentToolbarButton
      type="button"
      active={!props.disabled && props.open}
      aria-disabled={props.disabled}
      aria-label={translate('content.pageStyleInspector.showProperties')}
      aria-pressed={!props.disabled && props.open}
      dataUi="content.toolbar.page-style-inspector-button"
      disabled={props.disabled}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        if (!props.disabled) {
          props.onToggle();
        }
      }}
    >
      <SlidersHorizontal size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />
    </ContentToolbarButton>
  );
}
