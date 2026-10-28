import { DEFAULT_DRAWING_COLORS } from '../../../apps/extension/src/features/drawing/public';
import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { clonePaint, type Paint } from '@sniptale/foundation/paint';
import { useEyedropper, useFormatMode } from '@sniptale/ui/color-selector/popover-state';
import { ColorSelectorPickerPopover } from '../../../apps/extension/src/ui/color-selector/picker-popover';
import { PaintSelectorPopup } from '../../../apps/extension/src/ui/paint-selector/popup';
import { usePaintHistory } from '../../../apps/extension/src/ui/paint-selector/history';
import {
  usePaintModeState,
  type PaintModeDrafts,
} from '../../../apps/extension/src/ui/paint-selector/mode-state';
import { createDefaultGradientPresetCatalog } from '../../../apps/extension/src/composition/persistence/gradient-presets/defaults';
import type { GradientPresetCatalog } from '../../../apps/extension/src/composition/persistence/gradient-presets/contracts';
import type { GradientTemplateResources } from '../../../apps/extension/src/composition/gradient-preset-resources/use-gradient-preset-catalog';
import {
  addUserGradientPreset,
  deleteUserGradientPreset,
  updateGradientPresetValues,
  reorderGradientPresets,
  resetSystemGradientPreset,
  setDefaultGradientPreset,
  toggleGradientPresetEnabled,
  toggleGradientPresetFavorite,
} from '../../../apps/extension/src/composition/persistence/gradient-presets/mutations';
import { getGradientPresetDisplayName } from '../../../apps/extension/src/features/highlighter/gradient-presets/display-name';
import { getShowcaseGradientPaint } from '../../../apps/extension/src/features/highlighter/showcase-resources';
import { setLocalePreference, type AppLocale } from '../../../apps/extension/src/platform/i18n';
import './reference.css';

const palette = [...DEFAULT_DRAWING_COLORS];
const createId = () => crypto.randomUUID();
const densityKey = 'sniptale.design-reference.picker-compact';

function useDensity() {
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem(densityKey) === 'true';
    } catch {
      return false;
    }
  });
  return [
    compact,
    (value: boolean) => {
      setCompact(value);
      try {
        localStorage.setItem(densityKey, String(value));
      } catch {
        /* The current session remains editable. */
      }
    },
  ] as const;
}

/** Reference-only resources never read or write the extension's user catalog. */
function useReferenceTemplates(locale: AppLocale): GradientTemplateResources {
  const [catalog, setCatalog] = useState(createDefaultGradientPresetCatalog);
  const latest = useRef(catalog);
  latest.current = catalog;
  const mutate = (operation: (current: GradientPresetCatalog) => GradientPresetCatalog | null) => {
    const next = operation(latest.current);
    if (!next) return Promise.resolve(false);
    latest.current = next;
    setCatalog(next);
    return Promise.resolve(true);
  };
  const surface = 'highlighter-frame-fill' as const;
  return {
    presets: catalog.presets.map((preset) => ({
      ...preset,
      name: getGradientPresetDisplayName(preset, locale),
      favorite: catalog.favoriteIdsBySurface[surface]?.includes(preset.id) ?? false,
      isDefault: catalog.defaultPresetIdBySurface[surface] === preset.id,
    })),
    actions: {
      onSave: (name, gradient, id = createId()) =>
        mutate((current) =>
          addUserGradientPreset(current, {
            id,
            name,
            gradient,
            origin: 'user',
            customized: false,
            enabled: true,
            order: current.presets.length,
          })
        ),
      onUpdate: (id, gradient) =>
        mutate((current) => updateGradientPresetValues(current, id, gradient)),
      onEdit: (id, name, gradient) =>
        mutate((current) => updateGradientPresetValues(current, id, gradient, name)),
      onRename: (id, name) =>
        mutate((current) => {
          const preset = current.presets.find((item) => item.id === id);
          return preset ? updateGradientPresetValues(current, id, preset.gradient, name) : null;
        }),
      onDelete: (id) => mutate((current) => deleteUserGradientPreset(current, id)),
      onReorder: (ids) => mutate((current) => reorderGradientPresets(current, ids)),
      onResetPreset: (id) => mutate((current) => resetSystemGradientPreset(current, id)),
      onToggleEnabled: (id) => mutate((current) => toggleGradientPresetEnabled(current, id)),
      onSetDefault: (id) => mutate((current) => setDefaultGradientPreset(current, surface, id)),
      onToggleFavorite: (id) =>
        mutate((current) => toggleGradientPresetFavorite(current, surface, id)),
    },
  };
}

function ColorReference() {
  const [accepted, setAccepted] = useState('#FA7116A6');
  const [draft, setDraft] = useState(accepted);
  const [recent, setRecent] = useState<string[]>([]);
  const [session, setSession] = useState(0);
  const [compact, setCompact] = useDensity();
  const format = useFormatMode();
  const eyedropper = useEyedropper(setDraft, () => undefined);
  return (
    <div className="sniptale-reference-color" style={{ maxHeight: 'calc(100dvh - 24px)' }}>
      <ColorSelectorPickerPopover
        key={session}
        color={draft}
        originalColor={accepted}
        compact={compact}
        onToggleCompact={() => setCompact(!compact)}
        eyedropper={eyedropper}
        formatMode={format.formatMode}
        onCycleFormatMode={format.cycleFormatMode}
        palette={palette}
        recentColors={recent}
        title=""
        onColorChange={setDraft}
        onSelectTransparent={() => setDraft('#00000000')}
        onApply={() => {
          setAccepted(draft);
          setRecent((items) => [draft, ...items.filter((item) => item !== draft)].slice(0, 10));
          setSession((value) => value + 1);
        }}
        onCancel={() => {
          setDraft(accepted);
          setSession((value) => value + 1);
        }}
      />
    </div>
  );
}

type Profile = 'combined' | 'solid-linear' | 'gradient-only' | 'preset-editor';
function PaintReference({ locale }: { locale: AppLocale }) {
  const [profile, setProfile] = useState<Profile>('combined');
  const [accepted, setAccepted] = useState(() => getShowcaseGradientPaint('system-ocean'));
  const [session, setSession] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const resources = useReferenceTemplates(locale);
  const [compact, setCompact] = useDensity();
  const [name, setName] = useState('');
  return (
    <div className="sniptale-reference-paint">
      <div
        className="sniptale-reference-profiles"
        role="group"
        aria-label={locale === 'ru' ? 'Вариант пикера' : 'Picker variant'}
      >
        {(['combined', 'solid-linear', 'gradient-only', 'preset-editor'] as const).map(
          (value, index) => (
            <button
              key={value}
              type="button"
              aria-pressed={profile === value}
              onClick={() => {
                setProfile(value);
                setAccepted(getShowcaseGradientPaint('system-ocean'));
                setSession((current) => current + 1);
              }}
            >
              {
                (locale === 'ru'
                  ? ['Комбинированный', 'Цвет + линейный', 'Только градиенты', 'Редактор шаблона']
                  : ['Combined', 'Color + linear', 'Gradients only', 'Template editor'])[index]
              }
            </button>
          )
        )}
      </div>
      <PaintReferenceSession
        key={`${profile}:${session}`}
        accepted={accepted}
        resources={resources}
        compact={compact}
        onToggleCompact={() => setCompact(!compact)}
        profile={profile}
        name={name}
        onNameChange={setName}
        locale={locale}
        recent={recent}
        onApply={(paint) => {
          setAccepted(paint);
          if (paint.kind === 'solid')
            setRecent((items) =>
              [paint.color, ...items.filter((item) => item !== paint.color)].slice(0, 10)
            );
          setSession((value) => value + 1);
        }}
        onCancel={() => setSession((value) => value + 1)}
      />
    </div>
  );
}

function PaintReferenceSession(props: {
  accepted: Paint;
  resources: GradientTemplateResources;
  compact: boolean;
  onToggleCompact: () => void;
  profile: Profile;
  name: string;
  onNameChange: (name: string) => void;
  locale: AppLocale;
  recent: string[];
  onApply: (paint: Paint) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => clonePaint(props.accepted));
  const [selected, setSelected] = useState<string | null>(() =>
    draft.kind === 'gradient' ? (draft.gradient.stops[0]?.id ?? null) : null
  );
  const [section, setSection] = useState<'paint' | 'templates'>('paint');
  const modeDrafts = useRef<PaintModeDrafts>({});
  const history = usePaintHistory({
    draft,
    selected,
    open: true,
    modeDrafts,
    preview: setDraft,
    select: setSelected,
  });
  const setMode = usePaintModeState({
    createId,
    draft,
    externalValue: props.accepted,
    open: true,
    modeDrafts,
    preview: history.preview,
    selectStop: setSelected,
  });
  const format = useFormatMode();
  const allowed =
    props.profile === 'solid-linear'
      ? (['solid', 'linear'] as const)
      : props.profile === 'gradient-only' || props.profile === 'preset-editor'
        ? (['linear', 'radial', 'conic'] as const)
        : undefined;
  return (
    <div
      style={{
        width: draft.kind === 'gradient' ? 620 : 300,
        maxWidth: '100%',
        maxHeight: 'calc(100dvh - 112px)',
      }}
    >
      <PaintSelectorPopup
        {...(props.profile === 'preset-editor'
          ? {
              nameField: (
                <input
                  className="sniptale-reference-name"
                  aria-label={props.locale === 'ru' ? 'Название шаблона' : 'Template name'}
                  placeholder={props.locale === 'ru' ? 'Название' : 'Name'}
                  value={props.name}
                  maxLength={80}
                  onChange={(event) => props.onNameChange(event.target.value)}
                />
              ),
            }
          : {})}
        {...(allowed === undefined ? {} : { allowedModes: allowed })}
        resources={props.resources}
        draft={draft}
        original={props.accepted}
        compact={props.compact}
        onToggleCompact={props.onToggleCompact}
        history={history}
        apply={() => props.onApply(draft)}
        cancel={props.onCancel}
        createId={createId}
        formatMode={format.formatMode}
        onCycleFormatMode={format.cycleFormatMode}
        onEyedropperStateChange={() => undefined}
        onModeChange={setMode}
        palette={palette}
        recentColors={props.recent}
        preview={history.preview}
        selectedStopId={selected}
        selectStop={setSelected}
        title="Paint"
        section={section}
        setSection={setSection}
      />
    </div>
  );
}

/** Mount the product panels inside the canonical reference's existing theme surfaces. */
export async function mountPickerReferences(
  host: HTMLElement,
  options: { theme: 'light' | 'dark'; locale: AppLocale; kind: 'color' | 'paint' }
) {
  await setLocalePreference(options.locale);
  const frame = document.createElement('div');
  frame.className = 'sniptale-picker-reference';
  frame.dataset['theme'] = options.theme;
  frame.dataset['pickerReference'] = options.kind;
  const shell = document.createElement('div');
  host.append(shell);
  const shadow = shell.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./pickers.css', import.meta.url).href;
  await new Promise<void>((resolve, reject) => {
    stylesheet.onload = () => resolve();
    stylesheet.onerror = () => reject(new Error('Could not load the picker reference styles'));
    shadow.append(stylesheet);
  });
  shadow.append(frame);
  const root = createRoot(frame);
  root.render(
    options.kind === 'color' ? <ColorReference /> : <PaintReference locale={options.locale} />
  );
  return () => root.unmount();
}
