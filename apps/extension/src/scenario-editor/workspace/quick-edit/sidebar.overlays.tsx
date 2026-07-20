import { translate } from '../../../platform/i18n';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { updateScenarioOverlay } from './helpers';
import {
  getOverlayKindLabel,
  ScenarioQuickEditOverlayEditor,
} from './ScenarioQuickEditOverlayEditor';
import { SidebarSectionTitle } from './sidebar.sections';
import { SELECTED_OVERLAY_BACKGROUND_CLASS_NAME } from './sidebar-overlays.constants';

export function QuickEditOverlayList(props: {
  overlays: ScenarioCaptureStep['overlays'];
  selectedOverlayId: string | null;
  onOverlayChange: (overlayId: string, overlays: ScenarioCaptureStep['overlays']) => void;
  onOverlayRemove: (overlayId: string) => void;
  onSelectOverlay: (overlayId: string | null) => void;
}) {
  const selectedOverlay =
    props.overlays.find((overlay) => overlay.id === props.selectedOverlayId) ?? null;

  return (
    <div className="grid gap-3">
      <SidebarSectionTitle>{translate('scenario.editor.overlays')}</SidebarSectionTitle>
      <div className="grid gap-2">
        {props.overlays.map((overlay) => (
          <OverlayListRow
            key={overlay.id}
            overlay={overlay}
            selected={overlay.id === props.selectedOverlayId}
            onSelect={() => props.onSelectOverlay(overlay.id)}
          />
        ))}
      </div>

      {selectedOverlay ? (
        <SelectedOverlayPanel
          overlay={selectedOverlay}
          overlays={props.overlays}
          onOverlayChange={props.onOverlayChange}
          onOverlayRemove={props.onOverlayRemove}
        />
      ) : null}
    </div>
  );
}

function OverlayListRow(props: {
  overlay: ScenarioCaptureStep['overlays'][number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      data-selected={props.selected ? 'true' : undefined}
      className={[
        'flex items-center justify-between rounded-[14px] border px-3 py-2.5 text-left text-sm transition',
        props.selected
          ? [
              [
                'border-[color:color-mix(in_srgb,var(--sniptale-color-border-accent-strong)_54%,',
                'var(--sniptale-color-border-soft)_46%)]',
              ].join(''),
              SELECTED_OVERLAY_BACKGROUND_CLASS_NAME,
            ].join(' ')
          : [
              'border-[var(--sniptale-color-border-soft)]',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]',
              [
                'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_74%,',
                'var(--sniptale-color-border-accent-strong)_26%)]',
              ].join(''),
            ].join(' '),
      ].join(' ')}
    >
      <span>{getOverlayKindLabel(props.overlay.kind)}</span>
      <span className="text-xs text-[var(--sniptale-color-text-muted)]">{props.overlay.kind}</span>
    </button>
  );
}

function SelectedOverlayPanel(props: {
  overlay: ScenarioCaptureStep['overlays'][number];
  overlays: ScenarioCaptureStep['overlays'];
  onOverlayChange: (overlayId: string, overlays: ScenarioCaptureStep['overlays']) => void;
  onOverlayRemove: (overlayId: string) => void;
}) {
  return (
    <div
      className="grid gap-3 rounded-[18px] border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_18%,transparent)] p-3"
    >
      <ScenarioQuickEditOverlayEditor
        overlay={props.overlay}
        onChange={(nextOverlay) =>
          props.onOverlayChange(
            nextOverlay.id,
            updateScenarioOverlay(props.overlays, nextOverlay.id, () => nextOverlay)
          )
        }
      />
      <button
        type="button"
        onClick={() => props.onOverlayRemove(props.overlay.id)}
        className="rounded-[14px] border border-[var(--sniptale-color-border-soft)] px-3 py-2 text-sm
          text-[var(--sniptale-color-text-secondary)] transition hover:border-[var(--sniptale-color-danger)]
          hover:text-[var(--sniptale-color-danger)]"
      >
        {translate('scenario.editor.removeOverlay')}
      </button>
    </div>
  );
}
