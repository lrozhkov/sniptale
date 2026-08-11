import { SurfaceStyleEditorPanel } from './editor-panel';
import { SurfaceStylePresetGrid } from './preset-grid';
import type { useSurfaceStyleSelectorController } from './controller';
import type { SurfaceStyleSelectorProps } from './types';

type SurfaceStyleSelectorController = ReturnType<typeof useSurfaceStyleSelectorController>;

export function SurfaceStyleManagementPanel(props: {
  controller: SurfaceStyleSelectorController;
  selector: SurfaceStyleSelectorProps;
}) {
  const { controller, selector } = props;
  return (
    <>
      <SurfaceStylePresetGrid
        actions={selector.actions}
        draft={controller.state.draft}
        name={controller.state.name}
        onDraftChange={controller.actions.setDraft}
        presets={selector.presets}
      />
      <SurfaceStyleEditorPanel
        actions={selector.actions}
        canonicalCss={controller.state.canonicalCss}
        {...(selector.disabled === undefined ? {} : { disabled: selector.disabled })}
        draft={controller.state.draft}
        name={controller.state.name}
        onApply={() => {
          selector.onChange({
            ...controller.state.draft,
            surfaceCss: controller.state.canonicalCss ?? '',
          });
          controller.actions.notifyOpen(false);
        }}
        onCancel={() => controller.actions.notifyOpen(false)}
        onDraftChange={controller.actions.setDraft}
        onNameChange={controller.actions.setName}
      />
    </>
  );
}
