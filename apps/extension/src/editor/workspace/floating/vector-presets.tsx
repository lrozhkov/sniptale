import { useEffect, useState } from 'react';
import type { Group } from 'fabric';
import { BookmarkPlus } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CompactInput, CompactSelect } from '../../chrome/ui';
import { translate } from '../../../platform/i18n';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import type { EditorVectorStyleTransaction } from './use-vector-style-transaction';
import { VectorProperty } from './vector-style-properties';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
export function useEditorVectorPresets(
  first: Group | undefined,
  definition: EditorVectorDefinition | undefined,
  same: boolean,
  selectionKey: string,
  transaction: EditorVectorStyleTransaction
) {
  const session = useEditorVectorLibrarySession(),
    library = useEditorVectorLibrarySnapshot();
  const [presetName, setPresetName] = useState(''),
    [preset, setPreset] = useState('');
  useEffect(() => {
    void session.refresh();
  }, [session, selectionKey]);
  const compatible = library.local.presets.filter(
    (value) =>
      same &&
      (value.style.kind === 'definition'
        ? value.style.definitionId === definition?.id
        : definition?.slots.length === 1)
  );
  const applyPreset = (id: string) => {
    setPreset(id);
    if (!definition) return;
    const selected = compatible.find((value) => value.id === id);
    if (!selected) return;
    const style = selected.style;
    void transaction.commit(
      style.kind === 'monochrome'
        ? { colors: { [definition.slots[0]!.id]: style.color } }
        : { colors: style.colors, strokeScale: style.strokeScale }
    );
  };
  function save() {
    const instance = first?.sniptaleVectorElement;
    if (!instance || !definition) return;
    const colors = Object.fromEntries(
      definition.slots.map((slot) => [
        slot.id,
        instance.overrides.colors[slot.id] ?? slot.originalColor,
      ])
    );
    void session
      .savePreset({
        id: crypto.randomUUID(),
        name: presetName,
        style:
          definition.slots.length === 1
            ? { kind: 'monochrome', color: colors[definition.slots[0]!.id]! }
            : {
                kind: 'definition',
                definitionId: definition.id,
                colors,
                strokeScale: instance.overrides.strokeScale,
              },
      })
      .then((saved) => {
        if (saved) setPresetName('');
      });
  }
  return { presetName, setPresetName, preset, compatible, applyPreset, save, busy: library.busy };
}
export function EditorVectorPresetControls({
  model,
  active,
  toggle,
}: {
  model: ReturnType<typeof useEditorVectorPresets>;
  active: string | null;
  toggle(id: string): void;
}) {
  return (
    <VectorProperty
      id="vector-presets"
      title={message('presets')}
      trigger={<BookmarkPlus size={16} />}
      active={active}
      onToggle={toggle}
    >
      <div className="space-y-2">
        <CompactSelect
          aria-label={message('compatiblePresets')}
          value={model.preset}
          options={[
            { value: '', label: message('compatiblePresets') },
            ...model.compatible.map((value) => ({ value: value.id, label: value.name })),
          ]}
          onChange={model.applyPreset}
        />
        {!model.compatible.length ? (
          <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {message('noCompatiblePresets')}
          </p>
        ) : null}
        <CompactInput
          aria-label={message('presetName')}
          placeholder={message('presetName')}
          value={model.presetName}
          onChange={(event) => model.setPresetName(event.target.value)}
          maxLength={120}
        />
        <ContentToolbarButton
          tone="outline"
          disabled={!model.presetName.trim() || model.busy}
          dataUi="editor.vector.save-preset"
          onClick={model.save}
        >
          {message('savePreset')}
        </ContentToolbarButton>
      </div>
    </VectorProperty>
  );
}
