import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  GL_TRANSITION_PRESET_MAX_BYTES,
  exportGlTransitionPreset,
  importGlTransitionPresetBytes,
  glTransitionParameters,
  type GlTransitionSelection,
} from '../../features/video/project/transition/gl-catalog';
import { TextField } from '../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../platform/i18n';

type Props = {
  ownerKey: string;
  ownerRevision: object;
  selection: GlTransitionSelection;
  disabled?: boolean | undefined;
  onApply(selection: GlTransitionSelection): void | boolean | Promise<void | boolean>;
};
/** Owns bounded file IO and disposable feedback. The caller retains command and Undo authority. */
export function GlTransitionPresetActions(props: Props) {
  useAppLocale();
  const input = useRef<HTMLInputElement>(null);
  const owner = useRef({ active: true, revision: 0, pending: false });
  const nameOwner = useRef(props.ownerKey);
  const [name, setName] = useState(props.selection.name);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const signature = JSON.stringify(props.selection);
  useLayoutEffect(() => {
    owner.current.revision++;
    owner.current.pending = false;
    setBusy(false);
    setStatus(null);
    if (nameOwner.current !== props.ownerKey) {
      nameOwner.current = props.ownerKey;
      setName(props.selection.name);
    }
  }, [props.ownerKey, props.ownerRevision, signature, props.selection.name, props.disabled]);
  useEffect(() => {
    const lifetime = { active: true, revision: 0, pending: false };
    owner.current = lifetime;
    return () => {
      lifetime.active = false;
      lifetime.revision++;
    };
  }, []);
  const read = async (file: File) => {
    const lifetime = owner.current;
    if (props.disabled || lifetime.pending) return;
    const revision = ++lifetime.revision;
    const current = () => lifetime.active && lifetime.revision === revision;
    lifetime.pending = true;
    setBusy(true);
    setStatus(null);
    try {
      if (!file.size || file.size > GL_TRANSITION_PRESET_MAX_BYTES) {
        setStatus(translate('videoEditor.effectsLibrary.presetInvalid'));
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!current()) return;
      const result = importGlTransitionPresetBytes(bytes);
      if (!result.ok) {
        setStatus(
          result.code === 'unsupported'
            ? translate('videoEditor.effectsLibrary.presetUnsupported')
                .replace('{name}', result.name)
                .replace('{transition}', result.transitionName)
            : translate('videoEditor.effectsLibrary.presetInvalid')
        );
        return;
      }
      setName(result.preset.name);
      const accepted = await props.onApply(result.preset.transition);
      // Void means dispatched, not confirmed. Accepted props and caller feedback remain authoritative.
      if (current() && accepted === false)
        setStatus(translate('videoEditor.effectsLibrary.presetApplyFailed'));
    } catch {
      if (current()) setStatus(translate('videoEditor.effectsLibrary.presetApplyFailed'));
    } finally {
      if (current()) {
        lifetime.pending = false;
        setBusy(false);
      }
    }
  };
  const download = () => {
    if (props.disabled || owner.current.pending) return;
    setStatus(null);
    try {
      const file = exportGlTransitionPreset(props.selection, name);
      const url = URL.createObjectURL(file.blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.filename;
        anchor.click();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setStatus(translate('videoEditor.effectsLibrary.presetDownloadFailed'));
    }
  };
  return (
    <div
      className="min-w-0 space-y-1"
      data-ui="composition.gl-preset-actions"
      data-gl-preset-owner={props.ownerKey}
    >
      <TextField
        label={translate('videoEditor.effectsLibrary.presetName')}
        value={name}
        maxLength={120}
        disabled={props.disabled || busy}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".sniptale-gl-preset.json,application/json"
        disabled={props.disabled || busy}
        aria-label={translate('videoEditor.effectsLibrary.importGlPreset')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void read(file);
        }}
      />
      <div className="flex min-w-0 flex-wrap gap-1">
        <ContentToolbarButton
          type="button"
          tone="utility"
          size="compact"
          className="!w-auto !min-w-fit !gap-1.5 !px-2"
          disabled={props.disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} />
          {translate('videoEditor.effectsLibrary.importGlPreset')}
        </ContentToolbarButton>
        <ContentToolbarButton
          type="button"
          tone="utility"
          size="compact"
          className="!w-auto !min-w-fit !gap-1.5 !px-2"
          disabled={
            props.disabled || busy || !glTransitionParameters(props.selection) || !name.trim()
          }
          onClick={download}
        >
          <Download size={14} />
          {translate('videoEditor.effectsLibrary.downloadGlPreset')}
        </ContentToolbarButton>
      </div>
      {status && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {status}
        </p>
      )}
    </div>
  );
}
