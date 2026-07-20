import { AnnotatableImageToolbar } from '@sniptale/ui/annotatable-image-surface';
import { INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME } from '@sniptale/ui/inspector-shell';
import { ScenarioToolbarActions } from './actions';
import { ScenarioToolbarProjectSummary } from './project-summary';
import type { ScenarioEditorToolbarController } from './types';

export function ScenarioEditorToolbar(props: { controller: ScenarioEditorToolbarController }) {
  return (
    <AnnotatableImageToolbar
      className={`shrink-0 rounded-none border-x-0 border-t-0 ${INSPECTOR_SHELL_FIXED_HEADER_CLASS_NAME}`}
    >
      <ScenarioToolbarProjectSummary controller={props.controller} />
      <ScenarioToolbarActions controller={props.controller} />
    </AnnotatableImageToolbar>
  );
}
