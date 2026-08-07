import { CalloutPresetEditor } from './editor';
import { CalloutPresetsPanel } from './panel';
import type { CalloutPresetCatalogController } from './types';

export function CalloutPresetCatalogSettings(props: {
  controller: CalloutPresetCatalogController;
}) {
  return (
    <>
      <CalloutPresetsPanel controller={props.controller} />
      <CalloutPresetEditor controller={props.controller} />
    </>
  );
}

export { useCalloutPresetCatalogController } from './controller';
export type { CalloutPresetCatalogController } from './types';
