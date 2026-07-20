import { DesignSystemFloatingPreviewFrame } from '../support/provider';
import { ToggleGrid } from '../../../ui/compact-inspector-controls/toggle-grid';

const TOGGLE_GRID_PREVIEW_LABELS = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strike',
  underline: 'Underline',
} as const;

export function renderToggleGridPreview() {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={148} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[340px]">
        <ToggleGrid
          ariaLabel="Formatting"
          options={[
            { label: TOGGLE_GRID_PREVIEW_LABELS.bold, active: true, onToggle: () => undefined },
            { label: TOGGLE_GRID_PREVIEW_LABELS.italic, active: false, onToggle: () => undefined },
            {
              label: TOGGLE_GRID_PREVIEW_LABELS.underline,
              active: false,
              onToggle: () => undefined,
            },
            { label: TOGGLE_GRID_PREVIEW_LABELS.strike, active: false, onToggle: () => undefined },
          ]}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}
