import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLab, loadCorpus } from './server.mjs';
test('loopback lab serves only fixed GET assets and stamps current source', async () => {
  const lab = await startLab();
  try {
    const config = await (await fetch(`${lab.url}/config.json`)).json();
    assert.equal(config.cases.length, 3);
    assert.match(config.stamp.sourceDigest, /^[a-f0-9]{64}$/);
    assert.ok(
      Object.keys(config.stamp.sources).some((path) =>
        path.endsWith('/offscreen/simplify/worker.ts')
      )
    );
    for (const path of [
      '/package.json',
      '/fixtures/../../package.json',
      '/generated/unknown.mjs',
      '/config.json?path=package.json',
    ])
      assert.equal((await fetch(lab.url + path)).status, 404);
    assert.equal((await fetch(`${lab.url}/config.json`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${lab.url}/fixtures/forms.svg`)).status, 200);
    const html = await (await fetch(lab.url)).text();
    assert.match(html, /<script type="module" src="\.\/app\.mjs"><\/script>/u);
    const browserModule = await fetch(`${lab.url}/app.mjs`);
    assert.equal(browserModule.status, 200);
    assert.match(browserModule.headers.get('content-type'), /^text\/javascript/u);
    assert.match(
      await browserModule.text(),
      /import \{ compute \} from '\/generated\/adapter\.mjs'/u
    );
    assert.equal((await fetch(`${lab.url}/app.mjs`, { method: 'POST' })).status, 404);
  } finally {
    await lab.close();
  }
});
test('corpus rejects invalid identities and hashes before exposing routes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'simplify-corpus-'));
  try {
    const manifest = join(directory, 'corpus.json');
    await writeFile(
      manifest,
      JSON.stringify({ cases: [{ id: '../escape', path: 'source.png', sourceHash: 'no' }] })
    );
    await assert.rejects(loadCorpus(manifest), /Invalid corpus case/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
