import ts from 'typescript';
import { createHash } from 'node:crypto';

const DEVELOPMENT_ENDPOINT = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}/gu;
const LOCAL_PROVIDER_DEFAULTS = new Map([
  ['lm-studio', { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', catalog: 'openai' }],
  ['ollama', { label: 'Ollama', baseUrl: 'http://localhost:11434/api', catalog: 'ollama' }],
]);
const OLLAMA_FACTORY_DIGEST = '753da5d13a398045ce5f602d560a3327d730319bd7908aec17f1b14b400a6c31';

function isTextLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function approvedSdkSpan(node, sourceFile) {
  if (!isTextLiteral(node) || node.text !== 'http://127.0.0.1:11434/api') return null;
  let factory = node.parent;
  while (factory && !ts.isFunctionDeclaration(factory)) factory = factory.parent;
  if (!factory) return null;
  const tokens = [];
  function collect(current) {
    const children = current.getChildren(sourceFile);
    if (children.length) children.forEach(collect);
    else tokens.push([current.kind, current.getText(sourceFile)]);
  }
  collect(factory);
  const digest = createHash('sha256').update(JSON.stringify(tokens)).digest('hex');
  if (digest !== OLLAMA_FACTORY_DIGEST) return null;
  return { start: node.getStart(sourceFile), end: node.end };
}

function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;
}

function isTrue(node) {
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    (ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isNumericLiteral(node.operand) &&
      node.operand.text === '0')
  );
}

function approvedDefaultSpan(node, sourceFile) {
  if (
    !ts.isPropertyAssignment(node) ||
    propertyName(node.name) !== 'baseUrl' ||
    !isTextLiteral(node.initializer)
  )
    return null;
  const descriptor = node.parent;
  const provider = descriptor.parent;
  if (!ts.isObjectLiteralExpression(descriptor) || !ts.isPropertyAssignment(provider)) return null;
  const expected = LOCAL_PROVIDER_DEFAULTS.get(propertyName(provider.name));
  if (!expected || descriptor.properties.length !== 5) return null;
  const fields = new Map();
  for (const field of descriptor.properties) {
    if (!ts.isPropertyAssignment(field)) return null;
    const name = propertyName(field.name);
    if (!name || fields.has(name)) return null;
    fields.set(name, field.initializer);
  }
  for (const [name, value] of Object.entries({ ...expected, credential: 'none' })) {
    const field = fields.get(name);
    if (!field || !isTextLiteral(field) || field.text !== value) return null;
  }
  if (!fields.has('available') || !isTrue(fields.get('available'))) return null;
  return { start: node.initializer.getStart(sourceFile), end: node.initializer.end };
}

/** Admit exact provider defaults and the pinned SDK factory; other endpoint uses still fail. */
export function hasForbiddenDevelopmentEndpoint({ text, sourceFile }) {
  const approved = [];
  function visit(node) {
    const span = approvedDefaultSpan(node, sourceFile) ?? approvedSdkSpan(node, sourceFile);
    if (span) approved.push(span);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...text.matchAll(DEVELOPMENT_ENDPOINT)].some(
    (match) =>
      !approved.some(
        (span) => match.index >= span.start && match.index + match[0].length <= span.end
      )
  );
}
