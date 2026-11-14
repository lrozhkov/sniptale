import { Group } from 'fabric';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import { getEditorVectorDefinition } from '../../objects/vector-elements/runtime';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import { EditorVectorSourceNotice } from './catalog';
import { translate } from '../../../platform/i18n';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
export function EditorDocumentVectorSources() {
  const controller = useEditorController();
  useEditorStore((editor) => editor.layers);
  useEditorStore((editor) => editor.history.index);
  const used = new Map<string, EditorVectorDefinition>();
  function collect(group: Group): void {
    const definition = getEditorVectorDefinition(group);
    if (definition) used.set(definition.id, definition);
    else for (const child of group.getObjects()) if (child instanceof Group) collect(child);
  }
  for (const object of controller.canvas?.getObjects() ?? [])
    if (object instanceof Group) collect(object);
  return (
    <details data-ui="editor.elements.used-sources">
      <summary className="cursor-pointer font-medium">{message('usedSources')}</summary>
      <div className="mt-2 space-y-3">
        {used.size ? (
          [...used.values()].map((definition) => (
            <EditorVectorSourceNotice
              key={definition.id}
              provenance={definition.provenance}
              name={definition.provenance.name ?? message('localElement')}
            />
          ))
        ) : (
          <p className="text-[var(--sniptale-color-text-secondary)]">{message('noUsedSources')}</p>
        )}
      </div>
    </details>
  );
}
