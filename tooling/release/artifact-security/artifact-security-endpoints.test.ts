import { expect, it } from 'vitest';
import { getArtifactSourceSnapshot } from '../artifact-source/artifact-source-snapshot.mjs';
import { hasForbiddenDevelopmentEndpoint } from './artifact-security-endpoints.mjs';
import { getAIProviderDefinition } from '../../../apps/extension/src/contracts/settings/ai-provider';
import {
  bundledOllamaFactory,
  bundledOllamaBindings,
  renameOllamaBindings,
} from './artifact-security-ollama-factory.test-support';

const ollama = {
  label: 'Ollama',
  baseUrl: 'http://localhost:11434/api',
  catalog: 'ollama',
  credential: 'none',
  available: true,
};
function forbidden(text: string) {
  return hasForbiddenDevelopmentEndpoint(
    getArtifactSourceSnapshot({ relativePath: 'assets/providers.js', text })
  );
}
function catalog(descriptor: object, provider = 'ollama') {
  return `const providers=${JSON.stringify({ [provider]: descriptor })};`;
}

it('matches both current product defaults without changing their URLs', () => {
  for (const provider of ['ollama', 'lm-studio'] as const) {
    const { type, ...descriptor } = getAIProviderDefinition(provider);
    expect(forbidden(catalog(descriptor, type))).toBe(false);
  }
});

it('admits the exact SDK factory but blocks code, URL and adjacent-use drift', () => {
  expect(forbidden(bundledOllamaFactory)).toBe(false);
  expect(
    forbidden(bundledOllamaFactory.replace('specificationVersion', 'specificationVersions'))
  ).toBe(true);
  expect(forbidden(bundledOllamaFactory.replace('11434/api', '11434/dev'))).toBe(true);
  expect(forbidden(bundledOllamaFactory + 'fetch("http://127.0.0.1:11434/api");')).toBe(true);
});

it('retains SDK admission when the bundler renames its bindings', () => {
  for (const prefix of ['renamed_', 'other_']) {
    const renamed = renameOllamaBindings(bundledOllamaFactory, prefix);
    expect(renamed).not.toBe(bundledOllamaFactory);
    expect(forbidden(renamed)).toBe(false);
  }
});

it('retains lexical shadowing but rejects changed capture and dependency roles', () => {
  const path = 'url:({path:e})=>`${t}${e}`';
  const renamedPath = bundledOllamaFactory.replace(
    path,
    'url:({path:requestPath})=>`${t}${requestPath}`'
  );
  expect(renamedPath).not.toBe(bundledOllamaFactory);
  expect(forbidden(renamedPath)).toBe(false);
  expect(
    forbidden(bundledOllamaFactory.replace(path, 'url:({path:requestPath})=>`${t}${e}`'))
  ).toBe(true);
  const completion = bundledOllamaBindings.completion;
  const embedding = bundledOllamaBindings.embedding;
  const swap = bundledOllamaFactory
    .replace(`new ${completion}(`, 'new __swap__(')
    .replace(`new ${embedding}(`, `new ${completion}(`)
    .replace('new __swap__(', `new ${embedding}(`);
  expect(forbidden(swap)).toBe(true);
  expect(forbidden(bundledOllamaFactory.replace(`new ${embedding}(`, `new ${completion}(`))).toBe(
    true
  );
  expect(forbidden(bundledOllamaFactory.replace('async doEmbed(', 'async otherEmbed('))).toBe(true);
  expect(forbidden(bundledOllamaFactory.replace('throw Error(', 'throw OtherError('))).toBe(true);
  expect(forbidden(`const Error=customError;${bundledOllamaFactory}`)).toBe(true);
  expect(forbidden(bundledOllamaFactory.replace('return s(e)', 'return i(e)'))).toBe(true);
  expect(forbidden(bundledOllamaFactory.replace('bw(e.baseURL)', 'fetch(e.baseURL)'))).toBe(true);
});

it('admits minified template defaults but refuses interpolated defaults', () => {
  const template = catalog(ollama).replace(
    '"http://localhost:11434/api"',
    '`http://localhost:11434/api`'
  );
  expect(forbidden(template)).toBe(false);
  expect(forbidden(template.replace('11434/api`', '11434/${path}`'))).toBe(true);
});

it('admits only descriptor literals and retains adjacent endpoint failures', () => {
  const approved = catalog(ollama);
  expect(forbidden(approved)).toBe(false);
  expect(forbidden(approved + 'fetch("http://localhost:11434/api");')).toBe(true);
  expect(forbidden(approved + 'fetch("http://127.0.0.1:5173");')).toBe(true);
});

it.each([
  'fetch("http://localhost:11434/api");',
  'fetch("http://localhost:1234/v1");',
  'const url="http://localhost:11434/api";',
  'const config={baseUrl:"http://localhost:11434/api"};',
  catalog(ollama, 'other'),
  catalog({ ...ollama, label: 'Other' }),
  catalog({ ...ollama, catalog: 'openai' }),
  catalog({ ...ollama, credential: 'api-key' }),
  catalog({ ...ollama, available: false }),
  catalog({ ...ollama, extra: true }),
  catalog({ ...ollama, baseUrl: 'http://localhost:11434/dev' }),
  catalog({ ...ollama, baseUrl: 'http://localhost:5173/api' }),
  catalog({ ...ollama, baseUrl: 'http://127.0.0.1:11434/api' }),
  catalog(ollama).replace('"available":true', '"available":!1'),
  catalog(ollama).replace('"available":true', '"available":true,"available":true'),
  catalog(ollama).replace('"baseUrl":', '["baseUrl"]:'),
  catalog(ollama).replace(
    '"baseUrl":"http://localhost:11434/api"',
    'get baseUrl(){return "http://localhost:11434/api"}'
  ),
  catalog(ollama).replace('"available":true', '...{available:true}'),
])('blocks endpoints outside the exact descriptor: %s', (text) => {
  expect(forbidden(text)).toBe(true);
});
