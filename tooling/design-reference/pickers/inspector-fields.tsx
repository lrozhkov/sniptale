import { useId, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import type { Paint } from '@sniptale/foundation/paint';
import { CompactSelect } from '../../../apps/extension/src/ui/compact-inspector-controls/select';
import { CompactSegmentedSelector } from '../../../apps/extension/src/ui/compact-inspector-controls/control-renderers';
import { InspectorLayout } from '../../../apps/extension/src/ui/compact-inspector-controls/layout';
import { TextField } from '../../../apps/extension/src/ui/compact-inspector-controls/text-field';
import { TextareaField } from '../../../apps/extension/src/ui/compact-inspector-controls/textarea-field';
import '../../../apps/extension/src/ui/compact-inspector-controls/inspector-select.css';
import '../../../apps/extension/src/ui/compact-inspector-controls/inspector-text-fields.css';
import { CompactPaintSelector } from '../../../apps/extension/src/ui/paint-selector';
import { inspectorCopy } from './inspector-copy';
import { InspectorColorField } from './inspector-color-fields';
import { OpacityField } from '../../../apps/extension/src/ui/compact-inspector-controls/inspector-numeric-fields';
import { NumericValueField } from '../../../apps/extension/src/ui/compact-inspector-controls/numeric';

const initialColor = '#5985A3';
const gradientModes = ['linear', 'radial', 'conic'] as const;
const initialGradient: Paint = {
  kind: 'gradient',
  gradient: {
    type: 'linear',
    angle: 90,
    interpolation: 'srgb',
    repeat: { enabled: false, span: 1 },
    stops: [
      { id: 'first', position: 0, color: '#D4D4D8', midpoint: 0.5 },
      { id: 'last', position: 1, color: '#52525B', midpoint: 0.5 },
    ],
  },
};

export function InspectorFields({
  locale,
  palette,
}: {
  locale: keyof typeof inspectorCopy;
  palette: readonly string[];
}) {
  const copy = inspectorCopy[locale];
  const opacityId = useId();
  const [blend, setBlend] = useState<'normal' | 'multiply' | 'screen'>('normal');
  const [scale, setScale] = useState('1');
  const [opacity, setOpacity] = useState(72);
  const [radius, setRadius] = useState(16);
  const [radiusPreview, setRadiusPreview] = useState<number | null>(null);
  const [color, setColor] = useState(initialColor);
  const [gradient, setGradient] = useState(initialGradient);

  return (
    <div className="inspector-fields">
      <section className="inspector-sample">
        <div className="sample-stage" aria-hidden="true">
          <div
            className="subject"
            style={{
              backgroundColor: color,
              borderRadius: radiusPreview ?? radius,
              opacity: opacity / 100,
              mixBlendMode: blend,
              scale,
            }}
          />
        </div>
        <div className="parameters">
          <div className="parameter">
            <span id={opacityId} className="param-name">
              {copy.opacity}
            </span>
            <OpacityField
              copy={copy}
              labelledBy={opacityId}
              value={opacity}
              max={100}
              onChange={setOpacity}
            />
          </div>
          <div className="parameter" data-compact-select-menu-bounds="parameter">
            <span className="param-name" data-compact-select-menu-label="">
              {locale === 'ru' ? 'Наложение' : 'Blend mode'}
            </span>
            <CompactSelect
              aria-label={locale === 'ru' ? 'Наложение' : 'Blend mode'}
              appearance="plain"
              className="sniptale-inspector-select"
              menuClassName="sniptale-inspector-select-menu"
              options={[
                { value: 'normal', label: locale === 'ru' ? 'Обычный' : 'Normal' },
                { value: 'multiply', label: locale === 'ru' ? 'Умножение' : 'Multiply' },
                { value: 'screen', label: locale === 'ru' ? 'Экран' : 'Screen' },
              ]}
              value={blend}
              onChange={setBlend}
            />
          </div>
          <div className="parameter">
            <span className="param-name">{locale === 'ru' ? 'Масштаб' : 'Scale'}</span>
            <InspectorLayout>
              <CompactSegmentedSelector
                ariaLabel={locale === 'ru' ? 'Масштаб' : 'Scale'}
                columns={3}
                options={[
                  { value: '0.5', label: '50%' },
                  { value: '0.75', label: '75%' },
                  { value: '1', label: '100%' },
                ]}
                value={scale}
                onChange={setScale}
              />
            </InspectorLayout>
          </div>
          <div className="parameter">
            <span className="param-name">{copy.radius}</span>
            <div className="sniptale-compact-workspace">
              <InspectorLayout>
                <NumericValueField
                  label={copy.radius}
                  value={radius}
                  min={0}
                  max={64}
                  unit="px"
                  enterBehavior="blur"
                  stepperPlacement="sides"
                  onPreviewValue={setRadiusPreview}
                  onCommitValue={(value) => {
                    setRadius(value);
                    setRadiusPreview(null);
                  }}
                  onCancelValue={() => setRadiusPreview(null)}
                />
              </InspectorLayout>
            </div>
          </div>
          <InspectorColorField
            copy={copy}
            palette={palette}
            initialValue={initialColor}
            onVisibleColorChange={setColor}
          />
          <InspectorColorField copy={copy} palette={palette} initialValue="#5985A399" allowAlpha />
          <CompactPaintSelector
            className="gradient-field"
            triggerVariant="swatch"
            label={copy.gradient}
            title={copy.gradientEditor}
            value={gradient}
            allowedModes={gradientModes}
            palette={palette}
            onChange={setGradient}
          />
          <InspectorTextExamples locale={locale} />
        </div>
      </section>
    </div>
  );
}

function InspectorTextExamples({ locale }: { locale: keyof typeof inspectorCopy }) {
  const russian = locale === 'ru';
  const [title, setTitle] = useState(russian ? 'Новый объект' : 'New object');
  const [notes, setNotes] = useState(
    russian ? 'Первая строка.\nВторая строка.' : 'First line.\nSecond line.'
  );
  const acceptedTitle = useRef(title);
  const acceptedNotes = useRef(notes);
  const textarea = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="sniptale-compact-workspace reference-inspector-text">
      <InspectorLayout>
        <TextField
          label={russian ? 'Название' : 'Name'}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          onBlur={(event) => (acceptedTitle.current = event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.value = acceptedTitle.current;
            setTitle(acceptedTitle.current);
            event.currentTarget.blur();
          }}
        />
        <TextareaField
          ref={textarea}
          clearable={false}
          label={russian ? 'Текст' : 'Text'}
          value={notes}
          onChange={setNotes}
          rows={3}
          onBlur={(event) => (acceptedNotes.current = event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.value = acceptedNotes.current;
            setNotes(acceptedNotes.current);
            event.currentTarget.blur();
          }}
          accessory={
            <button
              type="button"
              className="reference-inspector-dictation"
              aria-label={russian ? 'Вставить пример диктовки' : 'Insert dictation sample'}
              onPointerDown={(event) => {
                if (event.button === 0) event.preventDefault();
              }}
              onClick={() => {
                const input = textarea.current;
                if (!input) return;
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const sample = russian ? 'Пример диктовки.' : 'Dictation sample.';
                const leading = /\S/u.test(notes.charAt(start - 1)) ? ' ' : '';
                const trailing = /\S/u.test(notes.charAt(end)) ? ' ' : '';
                input.setRangeText(leading + sample + trailing, start, end, 'end');
                setNotes(input.value);
                input.focus({ preventScroll: true });
              }}
            >
              <Mic size={14} aria-hidden="true" />
            </button>
          }
        />
      </InspectorLayout>
    </div>
  );
}
