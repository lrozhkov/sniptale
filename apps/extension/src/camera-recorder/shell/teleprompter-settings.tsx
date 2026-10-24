import { Settings2 } from 'lucide-react';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { CompactSegmentedSelector } from '../../ui/compact-inspector-controls/control-renderers';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
import type { ReadingPreferences } from './teleprompter-reader';

export type PlaybackMode = 'manual' | 'recording';
const SETTINGS_CLASS = [
  'camera-teleprompter-settings sniptale-content-popover fixed inset-auto m-0 grid',
  'max-w-[calc(100vw-16px)] gap-3 overflow-y-auto',
].join(' ');

export function TeleprompterSettings(props: {
  id: string;
  visible: boolean;
  paused: boolean;
  speed: number;
  fontSize: number;
  preferences: ReadingPreferences;
  playback: PlaybackMode;
  onPlaybackChange: (mode: PlaybackMode) => void;
  onPreferencesChange: (change: Partial<ReadingPreferences>) => void;
  onSpeedChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = `${props.id}-settings`;

  useEffect(() => {
    setOpen(false);
  }, [props.paused, props.visible]);

  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const element = panel.current;
    const anchor = trigger.current;
    const document = element.ownerDocument;
    const view = document.defaultView;
    if (!view) return;
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const width = Math.min(280, Math.max(0, view.innerWidth - 16));
      element.style.width = `${width}px`;
      element.style.maxHeight = `${Math.max(0, view.innerHeight - 16)}px`;
      element.style.left = `${Math.max(8, Math.min(bounds.right - width, view.innerWidth - width - 8))}px`;
      const height = element.getBoundingClientRect().height;
      const below = bounds.bottom + 4;
      element.style.top = `${Math.max(8, Math.min(below, view.innerHeight - height - 8))}px`;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      anchor.focus({ preventScroll: true });
    };
    const relocate = () => setOpen(false);
    const surface = anchor.closest('[data-recording-surface]');
    element.showPopover?.();
    position();
    element.querySelector<HTMLElement>('button, input, select')?.focus({ preventScroll: true });
    document.addEventListener('keydown', escape, true);
    view.addEventListener('resize', position);
    view.addEventListener('scroll', position, true);
    surface?.addEventListener('sniptale-recording-surface-change', relocate);
    return () => {
      document.removeEventListener('keydown', escape, true);
      view.removeEventListener('resize', position);
      view.removeEventListener('scroll', position, true);
      surface?.removeEventListener('sniptale-recording-surface-change', relocate);
    };
  }, [open]);

  return (
    <div className="shrink-0">
      <CameraWindowButton
        ref={trigger}
        iconOnly
        icon={Settings2}
        label={translate('popup.video.teleprompterSettings')}
        ariaExpanded={open}
        {...(open ? { ariaControls: panelId } : {})}
        onClick={() => setOpen(!open)}
      />
      {open ? (
        <div
          ref={panel}
          id={panelId}
          popover="auto"
          role="group"
          aria-label={translate('popup.video.teleprompterSettings')}
          className={SETTINGS_CLASS}
          onToggle={(event) => {
            if (event.newState === 'closed') setOpen(false);
          }}
        >
          <PlaybackChoice id={props.id} value={props.playback} onChange={props.onPlaybackChange} />
          <ReadingRange
            id={`${props.id}-speed`}
            label={translate('popup.video.teleprompterSpeed')}
            unit={translate('popup.video.teleprompterSpeedUnit')}
            value={props.speed}
            min={60}
            max={300}
            onChange={props.onSpeedChange}
          />
          <ReadingRange
            id={`${props.id}-font`}
            label={translate('popup.video.teleprompterFontSize')}
            unit={translate('popup.video.teleprompterFontSizeUnit')}
            value={props.fontSize}
            min={20}
            max={72}
            automatic={props.preferences.fontSize === null}
            onChange={(fontSize) => props.onPreferencesChange({ fontSize })}
          />
          <ReadingRange
            id={`${props.id}-width`}
            label={translate('popup.video.teleprompterColumnWidth')}
            unit={translate('popup.video.teleprompterColumnWidthUnit')}
            value={props.preferences.columnWidth ?? 40}
            min={20}
            max={80}
            automatic={props.preferences.columnWidth === null}
            onChange={(columnWidth) => props.onPreferencesChange({ columnWidth })}
          />
          <ReadingToggle
            id={`${props.id}-guide`}
            label={translate('popup.video.teleprompterFocusGuide')}
            checked={props.preferences.focusGuide}
            onChange={(focusGuide) => props.onPreferencesChange({ focusGuide })}
          />
          <CameraWindowButton
            label={translate('popup.video.teleprompterResetLayout')}
            onClick={() => props.onPreferencesChange({ fontSize: null, columnWidth: null })}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReadingRange(props: {
  id: string;
  label: string;
  unit: string;
  value: number;
  automatic?: boolean;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px] leading-4">
        <span id={`${props.id}-label`} className="text-[var(--sniptale-color-text-secondary)]">
          {props.label}
        </span>
        <output htmlFor={props.id} className="whitespace-nowrap tabular-nums">
          {props.automatic
            ? translate('popup.video.teleprompterAuto')
            : `${props.value} ${props.unit}`}
        </output>
      </div>
      <input
        id={props.id}
        aria-labelledby={`${props.id}-label`}
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        className="sniptale-range min-w-0 [--sniptale-range-shell-height:32px]! [--sniptale-range-track-height:3px]!"
        style={
          {
            '--sniptale-range-fill-ratio': `${((props.value - props.min) / (props.max - props.min)) * 100}%`,
          } as CSSProperties
        }
        onChange={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value) && value >= props.min && value <= props.max)
            props.onChange(value);
        }}
      />
    </div>
  );
}

function PlaybackChoice(props: {
  id: string;
  value: PlaybackMode;
  onChange: (mode: PlaybackMode) => void;
}) {
  return (
    <div className="grid gap-1 text-[12px] leading-4">
      <span
        id={`${props.id}-playback-label`}
        className="text-[var(--sniptale-color-text-secondary)]"
      >
        {translate('popup.video.teleprompterPlaybackMode')}
      </span>
      <CompactSegmentedSelector
        ariaLabel={translate('popup.video.teleprompterPlaybackMode')}
        columns={2}
        value={props.value}
        options={[
          { value: 'manual', label: translate('popup.video.teleprompterManual') },
          { value: 'recording', label: translate('popup.video.teleprompterWithRecording') },
        ]}
        onChange={props.onChange}
      />
    </div>
  );
}

function ReadingToggle(props: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-[12px] leading-4">
      <span id={`${props.id}-label`}>{props.label}</span>
      <ProductGlassSwitch
        id={props.id}
        role="switch"
        className="sniptale-compact-switch shrink-0"
        aria-labelledby={`${props.id}-label`}
        aria-checked={props.checked}
        on={props.checked}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  );
}
