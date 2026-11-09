import ts from 'typescript';
import fixture from './fixtures/ollama-factory.json';

export const bundledOllamaFactory = fixture.source;
export const bundledOllamaBindings = fixture.bindings;

/** Rename bindings while preserving wire properties, literals and lexical reference uses. */
export function renameOllamaBindings(source: string, prefix = 'renamed_'): string {
  const file = ts.createSourceFile(
    'sdk.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const bindings = new Set<string>();
  function declarations(node: ts.Node): void {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    )
      bindings.add(node.name.text);
    ts.forEachChild(node, declarations);
  }
  declarations(file);
  const edits: { start: number; end: number; value: string }[] = [];
  function references(node: ts.Node): void {
    if (ts.isIdentifier(node) && bindings.has(node.text)) {
      const parent = node.parent;
      const fixed =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node) ||
        ((ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
          parent.name === node) ||
        ts.isShorthandPropertyAssignment(parent) ||
        ts.isMetaProperty(parent);
      if (!fixed)
        edits.push({ start: node.getStart(file), end: node.end, value: prefix + node.text });
    }
    ts.forEachChild(node, references);
  }
  references(file);
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.value + text.slice(edit.end), source);
}
