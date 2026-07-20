import { translate } from '../../../../platform/i18n';
import {
  InlineCurtainCustomPanel,
  InlineCurtainPanelCloseButton,
  type InlineCurtainSecondaryAction,
} from './curtain-trigger';

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
      <InlineCurtainPanelCloseButton
        ariaLabel={translate('common.actions.close')}
        onClick={() => setOpenPanel(null)}
      />
      <div className="pt-1">{secondaryAction.panel}</div>
    </InlineCurtainCustomPanel>
  ) : null;
}
