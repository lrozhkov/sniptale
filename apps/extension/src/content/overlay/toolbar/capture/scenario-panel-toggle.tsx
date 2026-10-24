import { useRef, useState } from 'react';
import { FileStack } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import type { ToolbarCaptureActionsProps } from '../types';
import { PageControlVisibility } from '../controls/control-visibility';

export function ScenarioPanelToggle({
  scenario,
}: {
  scenario: NonNullable<ToolbarCaptureActionsProps['scenario']>;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const visible = scenario.enabled && scenario.sidebarVisible;
  const toggle = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await scenario.onToggleSidebar();
    } catch {
      showToast(translate('common.errors.saveFailed'), 'error');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <PageControlVisibility
      control="scenario-panel"
      label={translate('content.toolbar.showScenarioPanel')}
    >
      <ContentToolbarButton
        tone="property"
        active={visible}
        aria-pressed={visible}
        disabled={busy}
        dataUi="content.toolbar.scenario-panel-button"
        title={translate(
          visible ? 'content.toolbar.hideScenarioPanel' : 'content.toolbar.showScenarioPanel'
        )}
        onClick={(event) => {
          event.stopPropagation();
          void toggle();
        }}
      >
        <FileStack size={20} strokeWidth={2} />
      </ContentToolbarButton>
    </PageControlVisibility>
  );
}
