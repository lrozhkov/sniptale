import { expect, it } from 'vitest';

import { classifyPostProofChanges } from './post-proof-classifier.mjs';

const workflow = `
name: Release provenance
on: { workflow_dispatch: {} }
permissions: { contents: read }
jobs:
  canonical-proof: { uses: ./.github/workflows/_canonical-proof.yml }
  release-provenance-gate: { needs: canonical-proof, runs-on: ubuntu-24.04 }
  attest-release: { needs: release-provenance-gate, runs-on: ubuntu-24.04 }
`;

const canonicalProof = `
name: Canonical proof
on: { workflow_call: {} }
permissions: { contents: read }
jobs:
  canonical-qa: { runs-on: ubuntu-24.04 }
  release-provenance-gate: { needs: canonical-qa, runs-on: ubuntu-24.04 }
  publish-qa-image: { needs: release-provenance-gate, runs-on: ubuntu-24.04 }
`;

it('admits only exact post-proof owners while ignoring finalizer removal from provenance', () => {
  const control = workflow.replace(
    '  attest-release: { needs: release-provenance-gate, runs-on: ubuntu-24.04 }\n',
    ''
  );
  expect(
    classifyPostProofChanges({
      changes: [
        { status: 'M', path: '.github/workflows/_canonical-proof.yml' },
        { status: 'M', path: '.github/workflows/provenance.yml' },
        { status: 'A', path: '.github/workflows/provenance-finalize.yml' },
        { status: 'M', path: '.github/workflows/release.yml' },
      ],
      sourceCanonicalProof: canonicalProof,
      controlCanonicalProof: canonicalProof.replace(
        '  publish-qa-image: { needs: release-provenance-gate, runs-on: ubuntu-24.04 }\n',
        ''
      ),
      sourceProvenance: workflow,
      controlProvenance: control,
    })
  ).toMatchObject({ classification: 'post-proof-only' });
});

it('rejects canonical graph, product, and unsupported status changes', () => {
  expect(() =>
    classifyPostProofChanges({
      changes: [{ status: 'M', path: 'apps/extension/src/background/index.ts' }],
      sourceCanonicalProof: canonicalProof,
      controlCanonicalProof: canonicalProof,
      sourceProvenance: workflow,
      controlProvenance: workflow,
    })
  ).toThrow('Canonical proof invalidated');
  expect(() =>
    classifyPostProofChanges({
      changes: [{ status: 'M', path: '.github/workflows/provenance.yml' }],
      sourceCanonicalProof: canonicalProof,
      controlCanonicalProof: canonicalProof,
      sourceProvenance: workflow,
      controlProvenance: workflow.replace('contents: read', 'contents: write'),
    })
  ).toThrow('graph changed');
  expect(() =>
    classifyPostProofChanges({
      changes: [{ status: 'D', path: '.github/workflows/release.yml' }],
      sourceCanonicalProof: canonicalProof,
      controlCanonicalProof: canonicalProof,
      sourceProvenance: workflow,
      controlProvenance: workflow,
    })
  ).toThrow('Canonical proof invalidated');
  expect(() =>
    classifyPostProofChanges({
      changes: [{ status: 'M', path: 'tooling/ci/post-proof-classifier.mjs' }],
      sourceCanonicalProof: canonicalProof,
      controlCanonicalProof: canonicalProof,
      sourceProvenance: workflow,
      controlProvenance: workflow,
    })
  ).toThrow('Canonical proof invalidated');
  expect(() =>
    classifyPostProofChanges({
      changes: [{ status: 'M', path: '.github/workflows/_canonical-proof.yml' }],
      sourceCanonicalProof: canonicalProof,
      controlCanonicalProof: canonicalProof.replace('ubuntu-24.04', 'ubuntu-22.04'),
      sourceProvenance: workflow,
      controlProvenance: workflow,
    })
  ).toThrow('Canonical QA graph changed');
});
