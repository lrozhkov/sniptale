import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements/library';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import {
  parseEditorIconifySet,
  prepareEditorIconifyDefinition,
} from '../../objects/vector-elements/iconify';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';

interface ImportDependencies {
  library: Pick<EditorVectorLibrary, 'captureAdmission' | 'importDefinition' | 'createCollection'>;
  isAlive(): boolean;
  accepted(definition: EditorVectorDefinition): void;
  progress(rows: { name: string; accepted: number; declined: number }[]): void;
}
type Admission = Awaited<ReturnType<EditorVectorLibrary['captureAdmission']>>;
type ImportDestination = () => Promise<Admission | null>;
async function publishImport(
  definition: EditorVectorDefinition,
  name: string,
  destination: ImportDestination,
  dependencies: ImportDependencies
) {
  if (!dependencies.isAlive()) return false;
  const admission = await destination();
  if (!admission?.collection || !dependencies.isAlive()) return false;
  await dependencies.library.importDefinition(definition, {
    collection: admission.collection,
    name,
  });
  if (dependencies.isAlive()) dependencies.accepted(definition);
  return true;
}
async function importIconify(
  text: string,
  destination: ImportDestination,
  dependencies: ImportDependencies
) {
  const input: unknown = JSON.parse(text);
  const set = parseEditorIconifySet(input);
  let accepted = 0,
    declined = set.issues.length;
  for (const name of set.names) {
    if (!dependencies.isAlive()) break;
    try {
      const definition = await prepareEditorIconifyDefinition(set, name, 'local');
      if (!(await publishImport(definition, name, destination, dependencies))) break;
      accepted++;
    } catch {
      declined++;
    }
  }
  return { accepted, declined };
}
async function importFile(
  file: File,
  destination: ImportDestination,
  dependencies: ImportDependencies
) {
  if (file.size > 32 * 1024 * 1024) throw new Error('Vector import budget.');
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json'))
    return importIconify(text, destination, dependencies);
  const definition = await prepareEditorVectorDefinition(text, {
    sourceId: 'local',
    prefix: null,
    name: null,
    author: null,
    authorUrl: null,
    license: null,
    licenseUrl: null,
  });
  const accepted = await publishImport(definition, file.name, destination, dependencies);
  return { accepted: accepted ? 1 : 0, declined: 0 };
}
/** Retains one destination token for the batch; a deleted destination is never recreated. */
export async function importEditorVectorFiles(
  files: readonly File[],
  collectionId: string | undefined,
  dependencies: ImportDependencies,
  newCollectionName?: string
) {
  if (!files.length || !dependencies.isAlive()) return { completed: false, collectionId: null };
  let destinationId = collectionId ?? null;
  let admission: Promise<Admission | null> | undefined = collectionId
    ? dependencies.library.captureAdmission(undefined, collectionId)
    : undefined;
  if (admission) await admission;
  const destination: ImportDestination = () => {
    if (!admission)
      admission = (async () => {
        if (!dependencies.isAlive()) return null;
        const fallbackName =
          files[0]!.name
            .replace(/\.[^.]+$/u, '')
            .trim()
            .slice(0, 120) || 'SVG';
        const collection = await dependencies.library.createCollection({
          id: crypto.randomUUID(),
          name: newCollectionName?.trim() || fallbackName,
        });
        destinationId = collection.id;
        return {
          expectedItem: null,
          collection: { id: collection.id, incarnation: collection.incarnation },
        };
      })();
    return admission;
  };
  const rows: { name: string; accepted: number; declined: number }[] = [];
  for (const file of files) {
    if (!dependencies.isAlive()) return { completed: false, collectionId: destinationId };
    try {
      rows.push({ name: file.name, ...(await importFile(file, destination, dependencies)) });
    } catch {
      rows.push({ name: file.name, accepted: 0, declined: 1 });
    }
    dependencies.progress([...rows]);
  }
  return { completed: dependencies.isAlive(), collectionId: destinationId };
}
