const RUNTIME_NAMES = new Set([
  'background',
  'camera-recorder',
  'content',
  'design-system',
  'offscreen',
  'effect-runtime-sandbox',
  'popup',
  'settings',
  'gallery',
  'editor',
  'video-editor',
  'web-snapshot-viewer',
  'scenario-editor',
]);
const UI_RUNTIME_NAMES = new Set([
  'camera-recorder',
  'content',
  'popup',
  'settings',
  'gallery',
  'design-system',
  'editor',
  'video-editor',
  'web-snapshot-viewer',
  'scenario-editor',
]);
const SOURCE_FILE_PATTERN = /^(?:src|apps\/extension\/src)\//u;
const SHARED_RUNTIME_FILE_PATTERN =
  /^(?:src|apps\/extension\/src)\/shared\/(?:browser|messages|runtime|transport)\//u;

function hasAny(files, predicate) {
  return files.some(predicate);
}

function appRuntimeName(file) {
  return /^(?:src|apps\/extension\/src)\/([^/]+)\//u.exec(file)?.[1] ?? null;
}

function isNamedAppRuntimeFile(file, names) {
  const name = appRuntimeName(file);
  return name !== null && names.has(name);
}

export function isUiFile(file) {
  return isNamedAppRuntimeFile(file, UI_RUNTIME_NAMES);
}

function collectArchitectureDocs(targetFiles) {
  const docs = [];
  if (hasAny(targetFiles, (file) => SOURCE_FILE_PATTERN.test(file))) {
    docs.push('docs/architecture/code-organization.md');
  }
  if (hasAny(targetFiles, (file) => isNamedAppRuntimeFile(file, RUNTIME_NAMES))) {
    docs.push('docs/architecture/runtime-contexts.md');
  }
  if (hasAny(targetFiles, (file) => SHARED_RUNTIME_FILE_PATTERN.test(file))) {
    docs.push('docs/architecture/runtime-contexts.md');
  }
  if (hasAny(targetFiles, (file) => /^(?:src|apps\/extension\/src)\/shared\//u.test(file))) {
    docs.push('docs/architecture/platform-patterns-and-tradeoffs.md');
  }
  if (
    hasAny(targetFiles, (file) =>
      /(?:^(?:src|apps\/extension\/src)\/shared\/i18n\/|i18n|locale|\.tsx$)/u.test(file)
    )
  ) {
    docs.push('docs/architecture/i18n-architecture.md');
  }
  if (
    hasAny(targetFiles, (file) =>
      /^(?:src|apps\/extension\/src)\/content\/.*(?:parser|snapshot|profile|export)/u.test(file)
    )
  ) {
    docs.push('docs/architecture/parser-architecture.md');
  }
  if (hasAny(targetFiles, (file) => isUiFile(file) && /\.(?:tsx|css)$/u.test(file))) {
    docs.push('DESIGN.md');
  }
  return docs;
}

export function collectRelevantDocs(targetFiles) {
  const docs = [
    'AGENTS.md',
    'docs/engineering/implementation-rules.md',
    'docs/architecture/repository-overview.md',
    ...collectArchitectureDocs(targetFiles),
  ];

  if (
    hasAny(targetFiles, (file) =>
      /(?:secret|credential|token|diagnostic|trace|storage|db|fetch|ai-provider)/u.test(file)
    )
  ) {
    docs.push('docs/security/data-handling.md');
  }
  if (
    hasAny(targetFiles, (file) =>
      /(?:security-|dependency-|source-sbom|codeql|semgrep)/u.test(file)
    )
  )
    docs.push('docs/security/threat-model.md');

  return [...new Set(docs)];
}
