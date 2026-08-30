import { assertResolvedTargets } from './commands.mjs';
import {
  collectDeclaredEntryOrigins,
  collectSourceInvocationOrigins,
  createExecutableOriginSourceFile,
} from './source.mjs';
import {
  collectCatalogOrigins,
  collectDockerOrigins,
  collectDocumentedCommandOrigins,
  collectHookOrigins,
  collectPackageScriptOrigins,
  collectWorkflowOrigins,
} from './structured.mjs';

const COLLECTORS = {
  catalog: collectCatalogOrigins,
  docker: collectDockerOrigins,
  docs: collectDocumentedCommandOrigins,
  hook: collectHookOrigins,
  package: collectPackageScriptOrigins,
  workflow: collectWorkflowOrigins,
};

function assertUniqueAuthorities(authorityPaths) {
  const duplicates = authorityPaths.filter(
    (authority, index) => authorityPaths.indexOf(authority) !== index
  );
  if (duplicates.length === 0) return;
  throw new Error(
    `Duplicate executable origin authorities: ${[...new Set(duplicates)].sort().join(', ')}`
  );
}

function collectAuthorityProjection(authority) {
  if (authority.kind !== 'source' && authority.kind !== 'test-source') {
    const collector = COLLECTORS[authority.kind];
    if (!collector) throw new Error(`Unsupported executable origin authority: ${authority.kind}`);
    return { origins: collector({ authority: authority.path, ...authority }), unresolved: [] };
  }

  const origins = [];
  const isJavaScript = /\.(?:[cm]?[jt]s|tsx)$/u.test(authority.path);
  const sourceFile = isJavaScript
    ? createExecutableOriginSourceFile(authority.path, authority.source)
    : undefined;
  if (authority.kind === 'source' || authority.path.endsWith('.test.py')) {
    origins.push(
      ...collectDeclaredEntryOrigins({
        authority: authority.path,
        executableMode: authority.executableMode,
        source: authority.source,
        sourceFile,
      })
    );
  }
  if (!isJavaScript) {
    return { origins, unresolved: [] };
  }
  const invocation = collectSourceInvocationOrigins({
    authority: authority.path,
    source: authority.source,
    sourceFile,
    testProcess: authority.kind === 'test-source',
  });
  return { origins: [...origins, ...invocation.origins], unresolved: invocation.unresolved };
}

function assertNoUnresolvedExpressions(unresolved) {
  if (unresolved.length === 0) return;
  throw new Error(
    `Unresolved repository target expressions:\n${unresolved
      .map(({ authority, expression }) => `${authority}: ${expression}`)
      .sort()
      .join('\n')}`
  );
}

function selectActualOrigins(origins) {
  const uniqueOrigins = [...new Map(origins.map((origin) => [origin.id, origin])).values()].sort(
    (left, right) => left.id.localeCompare(right.id)
  );
  const processTargets = new Set(
    uniqueOrigins.filter(({ kind }) => kind !== 'qa-catalog-execution').map(({ target }) => target)
  );
  return {
    origins: uniqueOrigins.filter(({ target }) => processTargets.has(target)),
    targets: processTargets,
  };
}

export function collectExecutableOriginProjection({
  authorities,
  embeddedSourceFixtures = [],
  eagerCandidates = [],
  exists,
  inputs = [],
  registrationAuthorityPaths = [],
}) {
  const authorityPaths = authorities.map(({ path }) => path);
  assertUniqueAuthorities(authorityPaths);
  const origins = [];
  const unresolved = [];
  for (const authority of [...authorities].sort((a, b) => a.path.localeCompare(b.path))) {
    const projection = collectAuthorityProjection(authority);
    origins.push(...projection.origins);
    unresolved.push(...projection.unresolved);
  }
  assertNoUnresolvedExpressions(unresolved);
  const actual = selectActualOrigins(origins);
  assertResolvedTargets(actual.origins, { exists });
  return {
    authorities: authorityPaths.sort(),
    eagerCandidates: [...eagerCandidates].filter((target) => !actual.targets.has(target)).sort(),
    embeddedSourceFixtures: [...embeddedSourceFixtures].sort(),
    inputs: [...inputs].sort(),
    origins: actual.origins,
    registrationAuthorityPaths: [...registrationAuthorityPaths].sort(),
    targets: [...actual.targets].sort(),
  };
}

export {
  collectCatalogOrigins,
  collectDockerOrigins,
  collectDocumentedCommandOrigins,
  collectHookOrigins,
  collectPackageScriptOrigins,
  collectDeclaredEntryOrigins,
  collectSourceInvocationOrigins,
  collectWorkflowOrigins,
};
