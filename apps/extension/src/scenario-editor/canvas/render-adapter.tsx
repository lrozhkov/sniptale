import { createScenarioSlideSvgDataUrl } from '../project/stage-render/slide';

export function ScenarioCanvasSvgAdapter(props: { svg: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      src={createScenarioSlideSvgDataUrl(props.svg)}
    />
  );
}
