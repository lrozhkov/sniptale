import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  getRepresentativeColor,
  sampleGradient,
  serializePaintToCss,
  type Gradient,
  type Paint,
} from '@sniptale/foundation/paint';
import type {
  CalloutSurfaceProjection,
  ProjectedSurfaceShadow,
} from '../../surface-style/card-projection';
import { parseResolvedCalloutBoxShadow } from '../../surface-style/card-projection';
import { getCalloutStrokeDasharray } from '../../callout-stroke';
import type { getDynamicTailState } from './dynamic-tail';
import type { getLineConnectorState } from './line-connector';

type Rect = { x: number; y: number; width: number; height: number };
type ConnectorState =
  | ReturnType<typeof getDynamicTailState>
  | ReturnType<typeof getLineConnectorState>;

export type CalloutSurfaceGeometry = {
  bounds: Rect;
  clipPath: string;
  contentRect: Rect;
  kind: 'rect' | 'wedge';
  outlinePath?: string | undefined;
  radius: number;
};

type CalloutSurfaceCssContext = Pick<
  CSSProperties,
  'color' | 'fontFamily' | 'fontSize' | 'fontStyle' | 'fontWeight' | 'letterSpacing' | 'lineHeight'
>;

const GRADIENT_STOP_COUNT = 32;
const CONIC_SECTOR_COUNT = 72;

function resolveGeometry(props: CalloutSurfaceCompositorProps): SurfaceGeometry {
  if (props.geometry) return props.geometry;
  if (props.connector?.kind === 'wedge') {
    const { bounds, contentRect } = props.connector.geometry;
    return {
      bounds,
      clipPath: `path("${props.connector.outlinePath}")`,
      contentRect,
      kind: 'wedge',
      outlinePath: props.connector.outlinePath,
      radius: props.projection.surface.radius * props.visualScale,
    };
  }
  const width = props.dimensions.width;
  const height = props.dimensions.height;
  const radius = props.projection.surface.radius * props.visualScale;
  return {
    bounds: { x: 0, y: 0, width, height },
    clipPath: `inset(0 round ${radius}px)`,
    contentRect: { x: 0, y: 0, width, height },
    kind: 'rect',
    radius,
  };
}

type SurfaceGeometry = CalloutSurfaceGeometry;

function Shape(props: { geometry: SurfaceGeometry; [key: string]: unknown }) {
  const { geometry, ...shapeProps } = props;
  return geometry.kind === 'wedge' ? (
    <path d={geometry.outlinePath} {...shapeProps} />
  ) : (
    <rect
      height={geometry.bounds.height}
      rx={geometry.radius}
      width={geometry.bounds.width}
      {...shapeProps}
    />
  );
}

function getSampledStops(gradient: Gradient) {
  return Array.from({ length: GRADIENT_STOP_COUNT + 1 }, (_, index) => {
    const position = index / GRADIENT_STOP_COUNT;
    return <stop key={index} offset={position} stopColor={sampleGradient(gradient, position)} />;
  });
}

function resolveLinearAxis(gradient: Extract<Gradient, { type: 'linear' }>, rect: Rect) {
  const radians = (gradient.angle * Math.PI) / 180;
  const direction = { x: Math.sin(radians), y: -Math.cos(radians) };
  const halfLength = (Math.abs(direction.x) * rect.width + Math.abs(direction.y) * rect.height) / 2;
  const span = gradient.repeat.enabled ? gradient.repeat.span : 1;
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const start = {
    x: center.x - direction.x * halfLength,
    y: center.y - direction.y * halfLength,
  };
  return {
    x1: start.x,
    y1: start.y,
    x2: start.x + direction.x * halfLength * 2 * span,
    y2: start.y + direction.y * halfLength * 2 * span,
  };
}

function GradientDefinition(props: { gradient: Gradient; id: string; paintBox: Rect }) {
  const { gradient, id, paintBox } = props;
  if (gradient.type === 'linear') {
    return (
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        spreadMethod={gradient.repeat.enabled ? 'repeat' : 'pad'}
        {...resolveLinearAxis(gradient, paintBox)}
      >
        {getSampledStops(gradient)}
      </linearGradient>
    );
  }
  if (gradient.type === 'radial') {
    const cx = paintBox.x + paintBox.width * gradient.center.x;
    const cy = paintBox.y + paintBox.height * gradient.center.y;
    const radiusX = Math.max(0.001, paintBox.width * gradient.radius.x);
    const radiusY = Math.max(0.001, paintBox.height * gradient.radius.y);
    const span = gradient.repeat.enabled ? gradient.repeat.span : 1;
    return (
      <radialGradient
        id={id}
        cx={cx}
        cy={cy}
        gradientTransform={`translate(${cx} ${cy}) scale(1 ${radiusY / radiusX}) translate(${-cx} ${-cy})`}
        gradientUnits="userSpaceOnUse"
        r={radiusX * span}
        spreadMethod={gradient.repeat.enabled ? 'repeat' : 'pad'}
      >
        {getSampledStops(gradient)}
      </radialGradient>
    );
  }
  return null;
}

function ConicPaint(props: {
  clipPathId: string;
  geometry: SurfaceGeometry;
  gradient: Extract<Gradient, { type: 'conic' }>;
}) {
  const { contentRect, bounds } = props.geometry;
  const center = {
    x: contentRect.x + contentRect.width * props.gradient.center.x,
    y: contentRect.y + contentRect.height * props.gradient.center.y,
  };
  const radius = Math.max(
    ...[
      [0, 0],
      [bounds.width, 0],
      [bounds.width, bounds.height],
      [0, bounds.height],
    ].map(([x, y]) => Math.hypot(x! - center.x, y! - center.y))
  );
  const repeatSpan = props.gradient.repeat.enabled ? props.gradient.repeat.span : 1;
  return (
    <g clipPath={`url(#${props.clipPathId})`}>
      {Array.from({ length: CONIC_SECTOR_COUNT }, (_, index) => {
        const from = index / CONIC_SECTOR_COUNT;
        const to = (index + 1) / CONIC_SECTOR_COUNT;
        const sample = props.gradient.repeat.enabled ? (from / repeatSpan) % 1 : from;
        const fromAngle = ((props.gradient.startAngle - 90 + from * 360) * Math.PI) / 180;
        const toAngle = ((props.gradient.startAngle - 90 + to * 360) * Math.PI) / 180;
        const fromPoint = {
          x: center.x + Math.cos(fromAngle) * radius,
          y: center.y + Math.sin(fromAngle) * radius,
        };
        const toPoint = {
          x: center.x + Math.cos(toAngle) * radius,
          y: center.y + Math.sin(toAngle) * radius,
        };
        const sectorPath =
          `M ${center.x} ${center.y} L ${fromPoint.x} ${fromPoint.y} ` +
          `A ${radius} ${radius} 0 0 1 ${toPoint.x} ${toPoint.y} Z`;
        return <path key={index} d={sectorPath} fill={sampleGradient(props.gradient, sample)} />;
      })}
    </g>
  );
}

function SurfaceSvgLayer(props: {
  children: ReactNode;
  clipPathId: string;
  definitions?: ReactNode;
  geometry: SurfaceGeometry;
  ui: string;
}) {
  return (
    <svg
      aria-hidden="true"
      data-ui={props.ui}
      height={props.geometry.bounds.height}
      style={{ inset: 0, overflow: 'visible', position: 'absolute' }}
      viewBox={`0 0 ${props.geometry.bounds.width} ${props.geometry.bounds.height}`}
      width={props.geometry.bounds.width}
    >
      <defs>
        <clipPath id={props.clipPathId} clipPathUnits="userSpaceOnUse">
          <Shape geometry={props.geometry} />
        </clipPath>
        {props.definitions}
      </defs>
      {props.children}
    </svg>
  );
}

function PaintLayer(props: {
  clipPathId: string;
  geometry: SurfaceGeometry;
  paint: Paint;
  paintId: string;
}) {
  const gradient = props.paint.kind === 'gradient' ? props.paint.gradient : null;
  return (
    <SurfaceSvgLayer
      clipPathId={props.clipPathId}
      definitions={
        gradient ? (
          <GradientDefinition
            gradient={gradient}
            id={props.paintId}
            paintBox={props.geometry.contentRect}
          />
        ) : null
      }
      geometry={props.geometry}
      ui="content.callout.surface-paint"
    >
      {gradient?.type === 'conic' ? (
        <ConicPaint clipPathId={props.clipPathId} geometry={props.geometry} gradient={gradient} />
      ) : (
        <Shape
          geometry={props.geometry}
          fill={
            gradient
              ? `url(#${props.paintId})`
              : props.paint.kind === 'solid'
                ? props.paint.color
                : 'transparent'
          }
        />
      )}
    </SurfaceSvgLayer>
  );
}

function renderOuterShadows(
  geometry: SurfaceGeometry,
  shadows: ProjectedSurfaceShadow[],
  scale: number,
  id: string
) {
  return shadows
    .filter((shadow) => !shadow.inset)
    .map((shadow, index) => (
      <svg
        key={index}
        aria-hidden="true"
        data-ui="content.callout.surface-elevation"
        height={geometry.bounds.height}
        style={{
          inset: 0,
          overflow: 'visible',
          position: 'absolute',
        }}
        viewBox={`0 0 ${geometry.bounds.width} ${geometry.bounds.height}`}
        width={geometry.bounds.width}
      >
        <defs>
          <filter
            id={`callout-shadow-${id}-${index}`}
            colorInterpolationFilters="sRGB"
            height="300%"
            width="300%"
            x="-100%"
            y="-100%"
          >
            {shadow.spread === 0 ? null : (
              <feMorphology
                in="SourceAlpha"
                operator={shadow.spread > 0 ? 'dilate' : 'erode'}
                radius={Math.abs(shadow.spread * scale)}
                result="spread"
              />
            )}
            <feGaussianBlur
              in={shadow.spread === 0 ? 'SourceAlpha' : 'spread'}
              stdDeviation={shadow.blur * scale * 0.5}
              result="blur"
            />
            <feOffset
              dx={shadow.offsetX * scale}
              dy={shadow.offsetY * scale}
              in="blur"
              result="offset"
            />
            <feFlood floodColor={shadow.color} result="color" />
            <feComposite in="color" in2="offset" operator="in" result="colored-shadow" />
            <feComposite in="colored-shadow" in2="SourceAlpha" operator="out" />
          </filter>
        </defs>
        <Shape geometry={geometry} fill="#000" filter={`url(#callout-shadow-${id}-${index})`} />
      </svg>
    ));
}

function renderInsetShadows(
  geometry: SurfaceGeometry,
  shadows: ProjectedSurfaceShadow[],
  clipPathId: string,
  scale: number
) {
  return shadows
    .filter((shadow) => shadow.inset)
    .map((shadow, index) => (
      <Shape
        key={index}
        geometry={geometry}
        clipPath={`url(#${clipPathId})`}
        fill="none"
        stroke={shadow.color}
        strokeWidth={Math.max(1, (shadow.blur * 2 + shadow.spread * 2 + 1) * scale)}
        style={{ filter: shadow.blur > 0 ? `blur(${shadow.blur * scale * 0.5}px)` : undefined }}
        transform={`translate(${shadow.offsetX * scale} ${shadow.offsetY * scale})`}
      />
    ));
}

function getOutlineDasharray(style: string | undefined, width: number): string | undefined {
  if (style === 'dashed') return `${width * 4} ${width * 2.5}`;
  if (style === 'dotted') return `0 ${width * 2.5}`;
  return undefined;
}

type OutlineBand = {
  color: string;
  from: number;
  to: number;
};

function getOutlineBands(args: {
  color: string;
  offset: number;
  style: string | undefined;
  width: number;
  insetGradient: string;
  outsetGradient: string;
}): OutlineBand[] {
  const { color, offset, style, width } = args;
  if (width <= 0 || style === 'none' || style === 'hidden') return [];
  if (style === 'double') {
    const third = width / 3;
    return [
      { color, from: offset, to: offset + third },
      { color, from: offset + third * 2, to: offset + width },
    ];
  }
  if (style === 'groove' || style === 'ridge') {
    const middle = offset + width / 2;
    const inner = style === 'groove' ? args.insetGradient : args.outsetGradient;
    const outer = style === 'groove' ? args.outsetGradient : args.insetGradient;
    return [
      { color: inner, from: offset, to: middle },
      { color: outer, from: middle, to: offset + width },
    ];
  }
  if (style === 'inset') {
    return [{ color: args.insetGradient, from: offset, to: offset + width }];
  }
  if (style === 'outset') {
    return [{ color: args.outsetGradient, from: offset, to: offset + width }];
  }
  return [{ color, from: offset, to: offset + width }];
}

function OutlineBandShape(props: {
  band: OutlineBand;
  dashStyle: string | undefined;
  dashWidth: number;
  geometry: SurfaceGeometry;
  id: string;
}) {
  const from = Math.min(props.band.from, props.band.to);
  const to = Math.max(props.band.from, props.band.to);
  const dasharray = getOutlineDasharray(props.dashStyle, props.dashWidth);
  const linecap = props.dashStyle === 'dotted' ? 'round' : 'butt';
  const pieces = [
    ...(to > 0 ? [{ far: to, kind: 'outer' as const, near: Math.max(0, from) }] : []),
    ...(from < 0 ? [{ far: -from, kind: 'inner' as const, near: Math.max(0, -to) }] : []),
  ].filter((piece) => piece.far > piece.near);
  return pieces.map((piece, index) => {
    const maskId = `${props.id}-${piece.kind}-${index}`;
    const canvas = props.geometry.bounds;
    return (
      <g key={maskId} data-outline-band={piece.kind}>
        <defs>
          <mask
            id={maskId}
            height={canvas.height * 5}
            maskUnits="userSpaceOnUse"
            width={canvas.width * 5}
            x={-canvas.width * 2}
            y={-canvas.height * 2}
          >
            {piece.kind === 'outer' ? (
              <>
                <rect
                  fill="#fff"
                  height={canvas.height * 5}
                  width={canvas.width * 5}
                  x={-canvas.width * 2}
                  y={-canvas.height * 2}
                />
                <Shape
                  geometry={props.geometry}
                  fill="#000"
                  stroke="#000"
                  strokeWidth={piece.near * 2}
                />
              </>
            ) : (
              <>
                <Shape geometry={props.geometry} fill="#fff" />
                {piece.near > 0 ? (
                  <Shape
                    geometry={props.geometry}
                    fill="none"
                    stroke="#000"
                    strokeWidth={piece.near * 2}
                  />
                ) : null}
              </>
            )}
          </mask>
        </defs>
        <Shape
          geometry={props.geometry}
          fill="none"
          mask={`url(#${maskId})`}
          stroke={props.band.color}
          strokeDasharray={dasharray}
          strokeLinecap={linecap}
          strokeWidth={piece.far * 2}
        />
      </g>
    );
  });
}

function ContourLayer(props: {
  clipPathId: string;
  geometry: SurfaceGeometry;
  outline: CalloutSurfaceProjection['outline'];
  projection: CalloutSurfaceProjection;
  shadows: ProjectedSurfaceShadow[];
  visualScale: number;
}) {
  const borderWidth = props.projection.surface.borderWidth * props.visualScale;
  const outlineWidth = props.outline.width * props.visualScale;
  const outlineOffset = props.outline.offset * props.visualScale;
  const insetGradientId = `${props.clipPathId}-outline-inset`;
  const outsetGradientId = `${props.clipPathId}-outline-outset`;
  const outlineColor = props.outline.color ?? 'currentColor';
  const lightColor = `color-mix(in srgb, ${outlineColor} 55%, white)`;
  const darkColor = `color-mix(in srgb, ${outlineColor} 65%, black)`;
  const outlineBands = getOutlineBands({
    color: outlineColor,
    insetGradient: `url(#${insetGradientId})`,
    offset: outlineOffset,
    outsetGradient: `url(#${outsetGradientId})`,
    style: props.outline.style,
    width: outlineWidth,
  });
  return (
    <SurfaceSvgLayer
      clipPathId={props.clipPathId}
      definitions={
        <>
          <linearGradient id={insetGradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={darkColor} />
            <stop offset="1" stopColor={lightColor} />
          </linearGradient>
          <linearGradient id={outsetGradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={lightColor} />
            <stop offset="1" stopColor={darkColor} />
          </linearGradient>
        </>
      }
      geometry={props.geometry}
      ui="content.callout.surface-contour"
    >
      {outlineBands.map((band, index) => (
        <OutlineBandShape
          key={index}
          band={band}
          dashStyle={props.outline.style}
          dashWidth={outlineWidth}
          geometry={props.geometry}
          id={`${props.clipPathId}-outline-${index}`}
        />
      ))}
      {renderInsetShadows(props.geometry, props.shadows, props.clipPathId, props.visualScale)}
      {borderWidth > 0 ? (
        <Shape
          geometry={props.geometry}
          fill="none"
          stroke={props.projection.surface.borderColor}
          strokeDasharray={getCalloutStrokeDasharray(
            props.projection.surface.borderStyle,
            borderWidth
          )}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={borderWidth}
        />
      ) : null}
    </SurfaceSvgLayer>
  );
}

function resolveCustomPaintStyle(
  projection: CalloutSurfaceProjection,
  geometry: SurfaceGeometry,
  visualScale: number
): CSSProperties {
  const customOverridesBackground = projection.paintStyle.background !== undefined;
  const logicalContentRect = {
    x: geometry.contentRect.x / visualScale,
    y: geometry.contentRect.y / visualScale,
    width: geometry.contentRect.width / visualScale,
    height: geometry.contentRect.height / visualScale,
  };
  return {
    background: customOverridesBackground
      ? projection.paintStyle.background
      : serializePaintToCss(projection.fillPaint),
    ...(!customOverridesBackground && projection.fillPaint.kind === 'gradient'
      ? {
          backgroundColor: getRepresentativeColor(projection.fillPaint),
          backgroundPosition: `${logicalContentRect.x}px ${logicalContentRect.y}px`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${logicalContentRect.width}px ${logicalContentRect.height}px`,
        }
      : {}),
    ...projection.paintStyle,
  };
}

function ScaledCssPlane(props: {
  clipPath: string;
  geometry: SurfaceGeometry;
  style: CSSProperties;
  ui: string;
  visualScale: number;
}) {
  return (
    <div data-ui={props.ui} style={{ clipPath: props.clipPath, inset: 0, position: 'absolute' }}>
      <div
        style={{
          ...props.style,
          height: props.geometry.bounds.height / props.visualScale,
          transform: `scale(${props.visualScale})`,
          transformOrigin: 'top left',
          width: props.geometry.bounds.width / props.visualScale,
        }}
      />
    </div>
  );
}

function ScaledEffectStack(props: {
  children: ReactNode;
  geometry: SurfaceGeometry;
  style: CSSProperties;
  visualScale: number;
}) {
  return (
    <div
      data-ui="content.callout.surface-effects"
      style={{
        ...props.style,
        height: props.geometry.bounds.height / props.visualScale,
        left: 0,
        overflow: 'visible',
        position: 'absolute',
        top: 0,
        transform: `scale(${props.visualScale})`,
        transformOrigin: 'top left',
        width: props.geometry.bounds.width / props.visualScale,
      }}
    >
      <div
        style={{
          height: props.geometry.bounds.height,
          position: 'relative',
          transform: `scale(${1 / props.visualScale})`,
          transformOrigin: 'top left',
          width: props.geometry.bounds.width,
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

type CalloutSurfaceCompositorProps = {
  connector: ConnectorState | null;
  cssContext: CalloutSurfaceCssContext;
  dimensions: { width: number; height: number };
  geometry?: CalloutSurfaceGeometry | undefined;
  projection: CalloutSurfaceProjection;
  visualScale: number;
};

function composeResolvedSurfaceShadows(
  nativeShadows: ProjectedSurfaceShadow[],
  resolvedBoxShadow: string
): ProjectedSurfaceShadow[] {
  const customShadows = parseResolvedCalloutBoxShadow(resolvedBoxShadow);
  if (customShadows === null) return [];
  return customShadows.length > 0 && customShadows.every((shadow) => shadow.inset)
    ? [...nativeShadows, ...customShadows]
    : customShadows;
}

function useResolvedSurfaceEffects(
  projection: CalloutSurfaceProjection,
  cssContext: CalloutSurfaceCssContext
) {
  const probeRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<{
    key: string;
    outline: CalloutSurfaceProjection['outline'];
    shadows: ProjectedSurfaceShadow[];
  } | null>(null);
  const customBoxShadow = projection.customBoxShadow;
  const customOutline = projection.customOutline;
  const resolutionKey = JSON.stringify([customBoxShadow, customOutline, cssContext]);
  useLayoutEffect(() => {
    if ((customBoxShadow === undefined && customOutline === undefined) || !probeRef.current) return;
    const computed = getComputedStyle(probeRef.current);
    setResolved({
      key: resolutionKey,
      outline: {
        color: computed.outlineColor || projection.outline.color,
        offset: Number.parseFloat(computed.outlineOffset) || 0,
        style: (computed.outlineStyle || projection.outline.style) as CSSProperties['outlineStyle'],
        width: Number.parseFloat(computed.outlineWidth) || 0,
      },
      shadows:
        customBoxShadow !== undefined
          ? composeResolvedSurfaceShadows(projection.shadows, computed.boxShadow)
          : projection.shadows,
    });
  }, [customBoxShadow, customOutline, projection.outline, projection.shadows, resolutionKey]);
  const hasResolution = resolved?.key === resolutionKey;
  return {
    outline: customOutline && hasResolution ? resolved.outline : projection.outline,
    probeRef,
    shadows:
      customBoxShadow === undefined ? projection.shadows : hasResolution ? resolved.shadows : [],
  };
}

export function CalloutSurfaceCompositor(props: CalloutSurfaceCompositorProps): ReactNode {
  const id = useId().replaceAll(':', '');
  const geometry = resolveGeometry(props);
  const resolvedEffects = useResolvedSurfaceEffects(props.projection, props.cssContext);
  const usesCustomPaint = Object.keys(props.projection.paintStyle).length > 0;
  const rootStyle: CSSProperties = {
    ...props.cssContext,
    height: geometry.bounds.height,
    left: geometry.bounds.x,
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'absolute',
    top: geometry.bounds.y,
    width: geometry.bounds.width,
    zIndex: 0,
  };
  const content = (
    <>
      {renderOuterShadows(geometry, resolvedEffects.shadows, props.visualScale, id)}
      <ScaledCssPlane
        clipPath={geometry.clipPath}
        geometry={geometry}
        style={props.projection.backdropStyle}
        ui="content.callout.surface-backdrop"
        visualScale={props.visualScale}
      />
      {usesCustomPaint ? (
        <ScaledCssPlane
          clipPath={geometry.clipPath}
          geometry={geometry}
          style={resolveCustomPaintStyle(props.projection, geometry, props.visualScale)}
          ui="content.callout.surface-paint"
          visualScale={props.visualScale}
        />
      ) : (
        <PaintLayer
          clipPathId={`callout-paint-clip-${id}`}
          geometry={geometry}
          paint={props.projection.fillPaint}
          paintId={`callout-paint-${id}`}
        />
      )}
      <ContourLayer
        clipPathId={`callout-contour-clip-${id}`}
        geometry={geometry}
        outline={resolvedEffects.outline}
        projection={props.projection}
        shadows={resolvedEffects.shadows}
        visualScale={props.visualScale}
      />
    </>
  );
  return (
    <div aria-hidden="true" data-ui="content.callout.surface-compositor" style={rootStyle}>
      {props.projection.customBoxShadow !== undefined || props.projection.customOutline ? (
        <div
          ref={resolvedEffects.probeRef}
          data-ui="content.callout.surface-css-probe"
          style={{
            ...props.cssContext,
            boxShadow: props.projection.customBoxShadow,
            height: 0,
            outlineColor: props.projection.customOutline?.color,
            outlineOffset: props.projection.customOutline?.offset,
            outlineStyle: props.projection.customOutline?.style,
            outlineWidth: props.projection.customOutline?.width,
            position: 'absolute',
            visibility: 'hidden',
            width: 0,
          }}
        />
      ) : null}
      {Object.keys(props.projection.effectStyle).length > 0 ? (
        <ScaledEffectStack
          geometry={geometry}
          style={props.projection.effectStyle}
          visualScale={props.visualScale}
        >
          {content}
        </ScaledEffectStack>
      ) : (
        content
      )}
    </div>
  );
}
