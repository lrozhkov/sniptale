import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useEffect, useState } from 'react';
import { translate } from '../../platform/i18n';
import { CompactPaintSelector } from '../paint-selector';
import type { useSurfaceStyleSelectorController } from './controller';
import { SurfaceStylePresetGrid } from './preset-grid';
import type { SurfaceStyleSelectorProps } from './types';

type SurfaceStyleSelectorController = ReturnType<typeof useSurfaceStyleSelectorController>;
const MODE_HEADER_CLASS_NAME = [
  'grid gap-2 border-b pb-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]',
].join(' ');

export function SurfaceStyleSelectionPanel(props: {
  controller: SurfaceStyleSelectorController;
  selector: SurfaceStyleSelectorProps;
}) {
  const { controller, selector } = props;
  const [mode, setMode] = useState<'color' | 'surface'>(() =>
    controller.state.active ? 'surface' : 'color'
  );
  useEffect(() => {
    if (!controller.state.open) return;
    setMode(controller.state.active ? 'surface' : 'color');
  }, [controller.state.active, controller.state.open]);

  return (
    <>
      <div className={MODE_HEADER_CLASS_NAME}>
        <span className="text-[11px] font-semibold text-[var(--sniptale-color-text-muted)]">
          {translate('content.callout.surfaceStyle.backgroundType')}
        </span>
        <SegmentedSwitch
          activeId={mode}
          ariaLabel={translate('content.callout.surfaceStyle.backgroundType')}
          options={[
            { id: 'color', label: translate('content.callout.surfaceStyle.color') },
            { id: 'surface', label: translate('content.callout.surfaceStyle.surface') },
          ]}
          onChange={setMode}
        />
      </div>
      <div className="min-w-0">
        {mode === 'color' ? (
          <CompactPaintSelector
            label={translate('content.callout.surfaceStyle.color')}
            title={translate('content.callout.surfaceStyle.color')}
            value={controller.state.draft.fillPaint}
            onChange={(fillPaint) => {
              selector.onChange({ fillPaint, surfaceCss: '' });
            }}
          />
        ) : (
          <SurfaceStylePresetGrid
            actions={selector.actions}
            draft={controller.state.draft}
            name={controller.state.name}
            selectionOnly
            onDraftChange={(surface) => {
              selector.onChange(surface);
            }}
            presets={selector.presets}
          />
        )}
      </div>
    </>
  );
}
