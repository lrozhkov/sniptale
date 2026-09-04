import { useEffect, useId, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSolidPaint } from '@sniptale/foundation/paint';

import type {
  AppliedBorderSettings,
  BlurType,
  EffectMode,
  FrameData,
} from '../../../apps/extension/src/features/highlighter/contracts';
import {
  getBlurBackdropStyle,
  getBlurOverlayBox,
  getFocusMaskBox,
} from '../../../apps/extension/src/content/selection/frame-runtime/effects/geometry';
import { getResizeHandleStyle } from '../../../apps/extension/src/content/selection/interactive-frame/layout/resize-handle-position';
import { getInteractiveFrameDisplay } from '../../../apps/extension/src/content/selection/interactive-frame/render-model/render-model';
import { FrameAnnotationRasterizer } from '../../../apps/extension/src/offscreen/frame-annotation-rasterizer';
import { createFrameAnnotationSnapshot } from '../../../apps/extension/src/features/highlighter/frame-annotation';
import {
  blobToDataUrl,
  dataUrlToBlob,
} from '../../../apps/extension/src/platform/media-utils/data-url';
import {
  DynamicAnchorLifecycleHarness,
  parseDynamicAnchorScenario,
} from './highlighter-dynamic-anchor';

const SURFACE = { x: 30.25, y: 28.5, width: 132.5, height: 84.25 } as const;
const CELL = { width: 194, height: 140 } as const;
const HANDLE_SIZE = 12;

const THICK_SETTINGS: AppliedBorderSettings = {
  sourcePresetId: 'geometry-thick',
  sourcePresetName: 'Geometry thick',
  color: '#ff00ff',
  width: 20,
  style: 'solid',
  radius: 24,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  shadow: 0,
  fillPaint: createSolidPaint('#00d4ff40'),
  inheritCustomCss: false,
  customCss: '',
};

type GeometryCase = {
  id: string;
  label: string;
  effectMode: EffectMode;
  decorationVisible: boolean;
  fillVisible: boolean;
  blurType?: BlurType;
};

function getCheckerboardBackground(): string {
  return [
    'linear-gradient(45deg, #cbd5e1 25%, transparent 25%)',
    'linear-gradient(-45deg, #cbd5e1 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, #cbd5e1 75%)',
    'linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)',
  ].join(', ');
}

const GEOMETRY_CASES: GeometryCase[] = [
  {
    id: 'frame',
    label: 'Frame',
    effectMode: 'border',
    decorationVisible: true,
    fillVisible: false,
  },
  {
    id: 'frame-fill',
    label: 'Frame + fill',
    effectMode: 'border',
    decorationVisible: true,
    fillVisible: true,
  },
  {
    id: 'blur',
    label: 'Blur',
    effectMode: 'blur',
    decorationVisible: false,
    fillVisible: false,
    blurType: 'gaussian',
  },
  {
    id: 'blur-frame',
    label: 'Blur + frame',
    effectMode: 'blur',
    decorationVisible: true,
    fillVisible: false,
    blurType: 'pixelate',
  },
  {
    id: 'blur-frame-fill',
    label: 'Marker + frame + fill',
    effectMode: 'blur',
    decorationVisible: true,
    fillVisible: true,
    blurType: 'solid',
  },
  {
    id: 'mask',
    label: 'Mask',
    effectMode: 'focus',
    decorationVisible: false,
    fillVisible: false,
  },
  {
    id: 'mask-frame',
    label: 'Mask + frame',
    effectMode: 'focus',
    decorationVisible: true,
    fillVisible: false,
  },
  {
    id: 'mask-frame-fill',
    label: 'Mask + frame + fill',
    effectMode: 'focus',
    decorationVisible: true,
    fillVisible: true,
  },
];

function createFrame(testCase: GeometryCase): FrameData {
  return {
    id: testCase.id,
    ...SURFACE,
    effectMode: testCase.effectMode,
    borderSettings: {
      ...THICK_SETTINGS,
      fillPaint: createSolidPaint(testCase.fillVisible ? '#00d4ff40' : '#00d4ff00'),
    },
    blurSettings: {
      amount: 12,
      blurType: testCase.blurType ?? 'gaussian',
      showBorder: testCase.decorationVisible,
    },
    focusSettings: { opacity: 0.55, showBorder: testCase.decorationVisible },
  };
}

function FocusLayer(props: { frame: FrameData }) {
  const maskId = `focus-${useId().replaceAll(':', '')}`;
  const box = getFocusMaskBox(props.frame);
  const radius = props.frame.borderSettings?.radius ?? 0;

  return (
    <svg
      aria-hidden="true"
      height={CELL.height}
      style={{ inset: 0, position: 'absolute' }}
      width={CELL.width}
    >
      <defs>
        <mask id={maskId}>
          <rect fill="white" height={CELL.height} width={CELL.width} x={0} y={0} />
          <rect
            fill="black"
            height={box.height}
            rx={radius}
            width={box.width}
            x={box.x}
            y={box.y}
          />
        </mask>
      </defs>
      <rect
        fill="rgb(0 0 0 / 0.55)"
        height={CELL.height}
        mask={`url(#${maskId})`}
        width={CELL.width}
        x={0}
        y={0}
      />
      <rect
        data-layer="effect"
        fill="transparent"
        height={box.height}
        rx={radius}
        width={box.width}
        x={box.x}
        y={box.y}
      />
    </svg>
  );
}

function BlurLayer(props: { frame: FrameData }) {
  const box = getBlurOverlayBox(props.frame);
  const backdrop = getBlurBackdropStyle(props.frame);
  return (
    <div
      aria-hidden="true"
      data-layer="effect"
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        backdropFilter: backdrop.backdropFilter,
        backgroundColor: backdrop.backgroundColor,
        borderRadius: props.frame.borderSettings?.radius ?? 0,
        imageRendering: backdrop.imageRendering as 'auto' | 'pixelated',
      }}
    />
  );
}

function GeometryCaseView({ testCase }: { testCase: GeometryCase }) {
  const frame = createFrame(testCase);
  const display = getInteractiveFrameDisplay({
    frame,
    currentFrame: frame,
    effectMode: frame.effectMode ?? 'border',
    state: 'idle',
    zIndex: 2,
  });

  return (
    <article
      data-case={testCase.id}
      data-ui="geometry-case"
      style={{
        position: 'relative',
        width: CELL.width,
        height: CELL.height,
        overflow: 'hidden',
        border: '1px solid #334155',
        backgroundColor: '#f8fafc',
        backgroundImage: getCheckerboardBackground(),
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundSize: '16px 16px',
      }}
    >
      <strong style={{ position: 'absolute', left: 6, top: 5, zIndex: 4, font: '11px sans-serif' }}>
        {testCase.label}
      </strong>
      {testCase.effectMode === 'focus' ? <FocusLayer frame={frame} /> : null}
      {testCase.effectMode === 'blur' ? <BlurLayer frame={frame} /> : null}
      <div
        data-layer="frame"
        style={{
          position: 'absolute',
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        }}
      >
        <div style={display.frameStyle}>
          <div data-layer="fill" style={display.fillStyle} />
          <div data-layer="stroke" style={display.strokeStyle} />
        </div>
      </div>
      {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((direction) => (
        <span
          data-direction={direction}
          data-layer="handle"
          key={direction}
          style={{
            ...getResizeHandleStyle(direction, frame, HANDLE_SIZE),
            position: 'absolute',
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            border: '1px solid #0f172a',
            borderRadius: '50%',
            background: '#fff',
            boxSizing: 'border-box',
            zIndex: 3,
          }}
        />
      ))}
    </article>
  );
}

function createCheckerboardDataUrl(width: number, height: number, scale: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Highlighter geometry checkerboard canvas is unavailable.');
  context.scale(scale, scale);
  for (let y = 0; y < height; y += 10) {
    for (let x = 0; x < width; x += 10) {
      context.fillStyle = (x / 10 + y / 10) % 2 === 0 ? '#e2e8f0' : '#94a3b8';
      context.fillRect(x, y, 10, 10);
    }
  }
  return canvas.toDataURL('image/png');
}

function ViewerParity() {
  const [capture, setCapture] = useState('');

  useEffect(() => {
    const iframe = document.querySelector<HTMLIFrameElement>('[data-ui="geometry-viewer-source"]');
    if (!iframe) return;
    const testCase = GEOMETRY_CASES.find(({ id }) => id === 'blur-frame-fill')!;
    const scale = window.devicePixelRatio || 1;
    const baseDataUrl = createCheckerboardDataUrl(194, 140, scale);

    void dataUrlToBlob(baseDataUrl)
      .then((baseImage) =>
        new FrameAnnotationRasterizer().rasterize({
          baseImage,
          height: 140,
          requestedHeight: 140 * scale,
          requestedWidth: 194 * scale,
          snapshots: [createFrameAnnotationSnapshot(createFrame(testCase), 0)],
          width: 194,
        })
      )
      .then(({ blob }) => blobToDataUrl(blob))
      .then(setCapture);
  }, []);

  return (
    <section data-ui="geometry-viewer-parity" style={{ marginTop: 16 }}>
      <h2 style={{ margin: '0 0 8px', font: '600 13px sans-serif' }}>Viewer parity</h2>
      <iframe
        data-ui="geometry-viewer-source"
        src="about:blank"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 194,
          height: 140,
          visibility: 'hidden',
        }}
      />
      {capture ? (
        <img
          alt="Viewer geometry capture"
          data-stroke-width={THICK_SETTINGS.width}
          data-surface={`${SURFACE.x},${SURFACE.y},${SURFACE.width},${SURFACE.height}`}
          data-ui="geometry-viewer-capture"
          height={140}
          src={capture}
          style={{ display: 'block', border: '1px solid #334155' }}
          width={194}
        />
      ) : (
        <span data-ui="geometry-viewer-loading">Rendering…</span>
      )}
    </section>
  );
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const dynamicScenario = parseDynamicAnchorScenario(searchParams.get('dynamic'));
  if (dynamicScenario) {
    return <DynamicAnchorLifecycleHarness scenario={dynamicScenario} />;
  }
  const requestedZoom = Number(searchParams.get('zoom') ?? 100);
  const zoom = [80, 100, 125, 200].includes(requestedZoom) ? requestedZoom / 100 : 1;

  return (
    <main style={{ padding: 16, color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      <div data-ui="geometry-zoom-root" data-zoom={zoom} style={{ width: 408, zoom }}>
        <section
          data-ui="geometry-matrix"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 194px)', gap: 12 }}
        >
          {GEOMETRY_CASES.map((testCase) => (
            <GeometryCaseView key={testCase.id} testCase={testCase} />
          ))}
        </section>
        <ViewerParity />
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
