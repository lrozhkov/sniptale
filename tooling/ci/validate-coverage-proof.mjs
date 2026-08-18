import {
  materializeReusableCoverageProof,
  recordSuccessfulCoverageProof,
  resolveReusableCoverageProof,
} from '../qa/core/coverage-proof.mjs';
import {
  materializeReusableCodeqlSarif,
  recordSuccessfulCodeqlProof,
  resolveReusableCodeqlProof,
} from '../qa/core/codeql-proof.mjs';

const codeql = resolveReusableCodeqlProof();
if (codeql.matched) {
  const sarifPath = materializeReusableCodeqlSarif(codeql);
  recordSuccessfulCodeqlProof({ sarifPath, reusedFrom: codeql.proof.producer ?? null });
  process.stdout.write('CodeQL receipt: reused\n');
} else {
  process.stdout.write(`CodeQL receipt: unavailable (${codeql.reason})\n`);
}

const reusable = resolveReusableCoverageProof();
if (reusable.matched) {
  materializeReusableCoverageProof(reusable);
  recordSuccessfulCoverageProof({ reusedFrom: reusable.proof.producer ?? null });
  process.stdout.write('Coverage receipt: reused\n');
} else {
  process.stdout.write(`Coverage receipt: unavailable (${reusable.reason})\n`);
}
