import { StepBadgePresetEditor } from './editor';
import { StepBadgePresetsPanel } from './panel';
import type { StepBadgePresetCatalogController } from './types';

export function StepBadgePresetCatalogSettings(props: {
  controller: StepBadgePresetCatalogController;
}) {
  return (
    <>
      <StepBadgePresetsPanel controller={props.controller} />
      <StepBadgePresetEditor controller={props.controller} />
    </>
  );
}

export { useStepBadgePresetCatalogController } from './controller';
export type { StepBadgePresetCatalogController } from './types';
