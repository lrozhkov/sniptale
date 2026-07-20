import { useMemo } from 'react';
import { createScenarioSlideSvgDataUrl, renderScenarioSlide } from '../stage-render/slide';
import { instantiateScenarioTemplateSlide } from '../../../features/scenario/project/v3/templates';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';

export function ScenarioTemplatePreview(props: { template: ScenarioTemplateDefinition }) {
  const rendered = useMemo(
    () =>
      renderScenarioSlide(instantiateScenarioTemplateSlide(props.template), {
        missingAssetLabel: '',
        mode: 'thumbnail',
        outputHeight: 72,
        outputWidth: 128,
      }),
    [props.template]
  );

  return (
    <img
      alt=""
      aria-hidden="true"
      className="relative h-[72px] w-32 overflow-hidden rounded-[6px] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]"
      src={createScenarioSlideSvgDataUrl(rendered.svg)}
    />
  );
}
