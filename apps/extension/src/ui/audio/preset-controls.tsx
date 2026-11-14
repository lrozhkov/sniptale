import { useRef, useState } from 'react';
import { Check, Download, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import type { AudioProcessing } from '@sniptale/runtime-contracts/audio-effects';
import { SelectField, TextField } from '../compact-inspector-controls';
import { translate } from '../../platform/i18n';

/** Controlled catalogue presentation. The resource owner supplies all file and storage operations. */
export function AudioPresetControls(props: {
  items: readonly {
    id: string;
    label: string;
    enabled: boolean;
    unavailable: boolean;
    isUser: boolean;
    isDefault: boolean;
  }[];
  selectedId: string;
  modified: boolean;
  busy: boolean;
  canWrite: boolean;
  error: 'load' | 'write' | null;
  disabled?: boolean;
  hasValue: boolean;
  select(id: string): AudioProcessing | null;
  onApply(value: AudioProcessing): void;
  save(name: string): Promise<boolean>;
  rename(id: string, name: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  importFile(file: File): Promise<boolean>;
  exportCurrent(): void;
  reload(): Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<
    { kind: 'save' } | { kind: 'rename'; commit(name: string): Promise<boolean> } | null
  >(null);
  const [name, setName] = useState('');
  const selected = props.items.find((item) => item.id === props.selectedId);
  const disabled = props.disabled || props.busy;
  const finish = async () => {
    const intent = editing;
    if (intent && (await (intent.kind === 'rename' ? intent.commit(name) : props.save(name))))
      setEditing((current) => (current === intent ? null : current));
  };

  return (
    <div className="min-w-0 space-y-1" data-ui="audio.preset-controls">
      <SelectField
        label={translate('audioProcessing.presets.title')}
        value={props.selectedId}
        placeholder={translate('audioProcessing.presets.custom')}
        disabled={disabled}
        options={props.items.map((item) => ({
          value: item.id,
          label: item.label,
          disabled: !item.enabled || item.unavailable,
        }))}
        onChange={(id) => {
          const value = props.select(id);
          if (value) props.onApply(value);
        }}
      />
      {props.modified ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('audioProcessing.presets.modified')}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <EditorIconButton
          title={translate('audioProcessing.presets.save')}
          disabled={disabled || !props.hasValue || !props.canWrite}
          onClick={() => {
            setName('');
            setEditing({ kind: 'save' });
          }}
        >
          <Plus size={15} />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.presets.rename')}
          disabled={disabled || !selected?.isUser || !props.canWrite}
          onClick={() => {
            setName(selected?.label ?? '');
            if (selected) {
              const id = selected.id;
              setEditing({ kind: 'rename', commit: (name) => props.rename(id, name) });
            }
          }}
        >
          <Pencil size={15} />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.presets.remove')}
          disabled={disabled || !selected?.isUser || selected.isDefault || !props.canWrite}
          danger
          onClick={() => {
            if (selected) void props.remove(selected.id);
          }}
        >
          <Trash2 size={15} />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.presets.export')}
          disabled={disabled || !props.hasValue}
          onClick={props.exportCurrent}
        >
          <Download size={15} />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.presets.import')}
          disabled={disabled || !props.canWrite}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
        </EditorIconButton>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label={translate('audioProcessing.presets.importFile')}
        disabled={disabled || !props.canWrite}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void props.importFile(file);
        }}
      />
      {editing ? (
        <div className="min-w-0 space-y-1">
          <TextField
            label={translate('audioProcessing.presets.name')}
            value={name}
            maxLength={120}
            disabled={disabled}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setEditing(null);
              }
            }}
          />
          <div className="flex items-center justify-end gap-1">
            <EditorIconButton
              title={translate('audioProcessing.presets.cancel')}
              disabled={disabled}
              onClick={() => setEditing(null)}
            >
              <X size={15} />
            </EditorIconButton>
            <EditorIconButton
              title={translate('audioProcessing.presets.confirm')}
              disabled={disabled || !name.trim()}
              onClick={() => void finish()}
            >
              <Check size={15} />
            </EditorIconButton>
          </div>
        </div>
      ) : null}
      {props.error ? (
        <div role="alert" className="space-y-1 text-xs text-[var(--sniptale-color-danger)]">
          <p>
            {translate(
              props.error === 'load'
                ? 'audioProcessing.presets.loadFailed'
                : 'audioProcessing.presets.writeFailed'
            )}
          </p>
          {props.error === 'load' ? (
            <button type="button" onClick={() => void props.reload()}>
              {translate('audioProcessing.presets.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
