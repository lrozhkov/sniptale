import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements/library';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  parseEditorIconifySet,
  prepareEditorIconifyDefinition,
} from '../../objects/vector-elements/iconify';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';

interface ImportDependencies {
  library: Pick<EditorVectorLibrary, 'captureAdmission' | 'importDefinition'>;
  isAlive(): boolean;
  accepted(definition: EditorVectorDefinition): void;
  progress(rows: { name: string; accepted: number; declined: number }[]): void;
}
type Admission = Awaited<ReturnType<EditorVectorLibrary['captureAdmission']>>;
async function importIconify(text: string, admission: Admission, dependencies: ImportDependencies) {
  const input: unknown = JSON.parse(text);
  const set = parseEditorIconifySet(input);
  let accepted = 0,
    declined = set.issues.length;
  for (const name of set.names) {
    if (!dependencies.isAlive()) break;
    try {
      const definition = await prepareEditorIconifyDefinition(set, name, 'local');
      await dependencies.library.importDefinition(definition, {
        ...(admission.collection ? { collection: admission.collection } : {}),
        name,
      });
      dependencies.accepted(definition);
      accepted++;
    } catch {
      declined++;
    }
  }
  return { accepted, declined };
}
async function importFile(file: File, admission: Admission, dependencies: ImportDependencies) {
  if (file.size > 32 * 1024 * 1024) throw new Error('Vector import budget.');
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json'))
    return importIconify(text, admission, dependencies);
  const definition = await prepareEditorVectorDefinition(text, {
    sourceId: 'local',
    prefix: null,
    name: null,
    author: null,
    authorUrl: null,
    license: null,
    licenseUrl: null,
  });
  await dependencies.library.importDefinition(definition, {
    ...(admission.collection ? { collection: admission.collection } : {}),
    name: file.name,
  });
  dependencies.accepted(definition);
  return { accepted: 1, declined: 0 };
}
/** Publishes valid siblings independently while preserving one captured collection admission. */
export async function importEditorVectorFiles(
  files: readonly File[],
  collectionId: string | undefined,
  dependencies: ImportDependencies
) {
  const admission = await dependencies.library.captureAdmission(undefined, collectionId);
  const rows: { name: string; accepted: number; declined: number }[] = [];
  for (const file of files) {
    if (!dependencies.isAlive()) return false;
    try {
      rows.push({ name: file.name, ...(await importFile(file, admission, dependencies)) });
    } catch {
      rows.push({ name: file.name, accepted: 0, declined: 1 });
    }
    dependencies.progress([...rows]);
  }
  return true;
}
