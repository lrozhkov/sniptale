import { Circle, RectangleHorizontal } from 'lucide-react';
import { useState, type CSSProperties, type PointerEvent } from 'react';
import { SegmentedRow } from '../../../apps/extension/src/ui/compact-inspector-controls/controls';
import { InspectorSurface } from '../../../apps/extension/src/ui/compact-inspector-controls/layout';
import { PreviewNumericRow } from '../../../apps/extension/src/ui/compact-inspector-controls/numeric-preview';
import '../../../apps/extension/src/ui/compact-inspector-controls/inspector-surface.css';
import photo from '../../test/fixtures/image-compression/earthrise.jpg';

type Shape = 'circle' | 'rectangle';
type Placement = 'fixed' | 'follow';
type Optics = 'flat' | 'optical';

export function SegmentFitChoices({ locale }: { locale: 'ru' | 'en' }) {
  const ru = locale === 'ru';
  const [width, setWidth] = useState(327);
  const [target, setTarget] = useState<'window' | 'inside' | 'outside'>('window');
  const label = ru ? 'Область' : 'Target';

  return (
    <>
      <label className="reference-segment-width">
        <span>
          {ru ? 'Ширина панели' : 'Panel width'} · {width} px
        </span>
        <input
          type="range"
          min={120}
          max={440}
          value={width}
          onChange={(event) => setWidth(event.currentTarget.valueAsNumber)}
        />
      </label>
      <InspectorSurface className="reference-segment-fit" style={{ width }}>
        <SegmentedRow
          ariaLabel={label}
          label={label}
          options={[
            { value: 'window', label: ru ? 'Всё окно' : 'Whole window' },
            { value: 'inside', label: ru ? 'Внутри рамки' : 'Inside the frame' },
            { value: 'outside', label: ru ? 'Вне рамки' : 'Outside the frame', disabled: true },
          ]}
          value={target}
          onChange={setTarget}
        />
      </InspectorSurface>
    </>
  );
}

export function LensChoices({ locale }: { locale: 'ru' | 'en' }) {
  const ru = locale === 'ru';
  const [shape, setShape] = useState<Shape>('circle');
  const [placement, setPlacement] = useState<Placement>('fixed');
  const [optics, setOptics] = useState<Optics>('flat');
  const [diameter, setDiameter] = useState(50);
  const [width, setWidth] = useState(57);
  const [height, setHeight] = useState(44);
  const [magnification, setMagnification] = useState(2);
  const [edge, setEdge] = useState(8);
  const [anchor, setAnchor] = useState({ x: 56, y: 44 });
  const position = placement === 'follow' ? anchor : { x: 56, y: 44 };
  const round = shape === 'circle';
  const trackPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (placement !== 'follow') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnchor({
      x: (100 * (event.clientX - bounds.left)) / bounds.width,
      y: (100 * (event.clientY - bounds.top)) / bounds.height,
    });
  };

  return (
    <InspectorSurface className="reference-lens-inspector">
      <div className="reference-lens-shape">
        <div
          aria-label={ru ? 'Предпросмотр увеличения' : 'Magnification preview'}
          className="reference-lens-preview"
          onPointerMove={trackPointer}
          role="img"
          style={{ '--lens-source': `url("${photo}")` } as CSSProperties}
        >
          <img src={photo} alt="" />
          <div
            className="reference-lens"
            data-shape={shape}
            data-optics={optics}
            style={
              {
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: round ? `${diameter * 0.73}cqh` : `${width * 0.64}%`,
                height: `${(round ? diameter : height) * 0.73}%`,
                '--zoom': magnification,
                '--edge': `${edge}px`,
                '--source-x': `${position.x}%`,
                '--source-y': `${position.y}%`,
              } as CSSProperties
            }
          />
        </div>
        <SegmentedRow<Shape>
          ariaLabel={ru ? 'Форма линзы' : 'Lens shape'}
          label={ru ? 'Форма линзы' : 'Lens shape'}
          layout="stacked"
          showOptionLabels
          columns={2}
          options={[
            {
              value: 'circle',
              label: ru ? 'Круг' : 'Circle',
              icon: <Circle size={19} strokeWidth={1.5} aria-hidden />,
            },
            {
              value: 'rectangle',
              label: ru ? 'Прямоугольник' : 'Rectangle',
              icon: <RectangleHorizontal size={21} strokeWidth={1.5} aria-hidden />,
            },
          ]}
          value={shape}
          onChange={setShape}
        />
      </div>
      <div className="sniptale-parameter-stack">
        <SegmentedRow<Placement>
          ariaLabel={ru ? 'Положение' : 'Position'}
          label={ru ? 'Положение' : 'Position'}
          columns={2}
          options={[
            { value: 'fixed', label: ru ? 'Вручную' : 'Manual' },
            { value: 'follow', label: ru ? 'По курсору' : 'Follow cursor' },
          ]}
          value={placement}
          onChange={setPlacement}
        />
        {round ? (
          <PreviewNumericRow
            label={ru ? 'Диаметр' : 'Diameter'}
            value={diameter}
            min={1}
            max={100}
            step={1}
            unit="%"
            onChange={setDiameter}
          />
        ) : (
          <>
            <PreviewNumericRow
              label={ru ? 'Ширина' : 'Width'}
              value={width}
              min={1}
              max={100}
              step={1}
              unit="%"
              onChange={setWidth}
            />
            <PreviewNumericRow
              label={ru ? 'Высота' : 'Height'}
              value={height}
              min={1}
              max={100}
              step={1}
              unit="%"
              onChange={setHeight}
            />
          </>
        )}
        <PreviewNumericRow
          label={ru ? 'Увеличение' : 'Magnification'}
          value={magnification}
          min={1}
          max={4}
          step={0.1}
          precision={2}
          unit="x"
          rangePresentation="field"
          onChange={setMagnification}
        />
        <SegmentedRow<Optics>
          ariaLabel={ru ? 'Оптика' : 'Optics'}
          label={ru ? 'Оптика' : 'Optics'}
          columns={2}
          options={[
            { value: 'flat', label: ru ? 'Плоская' : 'Flat' },
            { value: 'optical', label: ru ? 'Оптическая' : 'Optical' },
          ]}
          value={optics}
          onChange={setOptics}
        />
        {optics === 'optical' && (
          <PreviewNumericRow
            label={ru ? 'Ширина края' : 'Edge width'}
            value={edge}
            min={1}
            max={30}
            step={1}
            unit="%"
            rangePresentation="field"
            onChange={setEdge}
          />
        )}
      </div>
    </InspectorSurface>
  );
}
