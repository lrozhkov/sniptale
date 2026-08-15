import { translate } from '../../../platform/i18n';
import {
  InlineCurtainCustomPanel,
  InlineCurtainPanelHeader,
  type InlineCurtainSecondaryAction,
} from './trigger';

export function renderSecondaryCurtainPanel({
  openPanel,
  panelId,
  secondaryAction,
  setOpenPanel,
}: {
  openPanel: 'options' | 'secondary' | null;
  panelId: string;
  secondaryAction?: InlineCurtainSecondaryAction;
  setOpenPanel: (openPanel: 'options' | 'secondary' | null) => void;
}) {
  return openPanel === 'secondary' && secondaryAction ? (
    <InlineCurtainCustomPanel id={panelId}>
      <InlineCurtainPanelHeader
        action="close"
        actionAriaLabel={translate('common.actions.close')}
        description={secondaryAction.panelDescription}
        onAction={() => setOpenPanel(null)}
        title={secondaryAction.panelTitle}
      />
      <div>{secondaryAction.panel}</div>
    </InlineCurtainCustomPanel>
  ) : null;
}
