import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useEffect, useState } from 'react';
import { translate } from '../../platform/i18n';
import { CompactPaintSelector } from '../paint-selector';
import type { useSurfaceStyleSelectorController } from './controller';
import { SurfaceStylePresetGrid } from './preset-grid';
import type { SurfaceStyleSelectorProps } from './types';

type SurfaceStyleSelectorController = ReturnType<typeof useSurfaceStyleSelectorController>;

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
      <SegmentedSwitch
        activeId={mode}
        ariaLabel={translate('content.callout.surfaceStyle.backgroundType')}
        options={[
          { id: 'color', label: translate('content.callout.surfaceStyle.color') },
          { id: 'surface', label: translate('content.callout.surfaceStyle.surface') },
        ]}
        onChange={setMode}
      />
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
    </>
  );
}
