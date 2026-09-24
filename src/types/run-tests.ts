import { runDomainTests } from './ops.test';

const results = runDomainTests();
for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.test}${result.message ? ` — ${result.message}` : ''}`);
}

const failures = results.filter((result) => !result.passed);
if (failures.length > 0) {
  console.error(`${failures.length}/${results.length} domain tests failed.`);
  process.exitCode = 1;
} else {
  console.log(`${results.length}/${results.length} domain tests passed.`);
}
