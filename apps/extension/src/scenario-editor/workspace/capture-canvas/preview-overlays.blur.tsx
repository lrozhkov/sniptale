import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';
import { projectRect } from '../../project/stage-render/svg-overlays.helpers';
import {
  getScenarioBlurDisplacementScale,
  getScenarioBlurFill,
  resolveScenarioBlurSettings,
} from '../../project/stage-render/svg-overlays/renderers/blur-shared';

function getBlurOverlayStroke() {
  return '#475569';
}

function BlurFilter(props: {
  blurId: string;
  settings: ReturnType<typeof resolveScenarioBlurSettings>;
}) {
  const { blurId, settings } = props;
  if (settings.blurType === 'solid') {
    return null;
  }

  return (
    <filter id={blurId}>
      {settings.blurType === 'distortion' ? (
        <>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02"
            numOctaves="3"
            seed="5"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={getScenarioBlurDisplacementScale(settings)}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </>
      ) : (
        <feGaussianBlur stdDeviation={settings.amount} />
      )}
    </filter>
  );
}

function BlurOverlayImage(props: {
  assetDataUrl: string;
  blurId: string;
  clipId: string;
  imageRect: ScenarioStageLayout['imageRect'];
  settings: ReturnType<typeof resolveScenarioBlurSettings>;
}) {
  if (props.settings.blurType === 'solid') {
    return null;
  }

  return (
    <image
      href={props.assetDataUrl}
      x={props.imageRect.x}
      y={props.imageRect.y}
      width={props.imageRect.width}
      height={props.imageRect.height}
      filter={`url(#${props.blurId})`}
      clipPath={`url(#${props.clipId})`}
      preserveAspectRatio="none"
    />
  );
}

function createRoundedRectProps(rect: ReturnType<typeof projectRect>) {
  return { height: rect.height, rx: 10, ry: 10, width: rect.width, x: rect.x, y: rect.y };
}

function BlurOverlayBorder(props: { rect: ReturnType<typeof projectRect> }) {
  return (
    <rect
      {...createRoundedRectProps(props.rect)}
      fill="none"
      stroke={getBlurOverlayStroke()}
      strokeWidth={2}
    />
  );
}

export function BlurRectOverlay(props: {
  assetDataUrl: string;
  imageRect: ScenarioStageLayout['imageRect'];
  layout: ScenarioStageLayout;
  overlay: Extract<ScenarioOverlay, { kind: 'blur-rect' }>;
  overlayIdPrefix: string;
}) {
  const rect = projectRect(props.layout, props.overlay.rect);
  const roundedRect = createRoundedRectProps(rect);
  const blurId = `${props.overlayIdPrefix}-blur`;
  const clipId = `${props.overlayIdPrefix}-clip`;
  const settings = resolveScenarioBlurSettings(props.overlay.blurSettings);

  return (
    <>
      <defs>
        <BlurFilter blurId={blurId} settings={settings} />
        <clipPath id={clipId}>
          <rect {...roundedRect} />
        </clipPath>
      </defs>
      <rect {...roundedRect} fill={getScenarioBlurFill(settings)} clipPath={`url(#${clipId})`} />
      <BlurOverlayImage
        assetDataUrl={props.assetDataUrl}
        blurId={blurId}
        clipId={clipId}
        imageRect={props.imageRect}
        settings={settings}
      />
      {settings.showBorder ? <BlurOverlayBorder rect={rect} /> : null}
    </>
  );
}
