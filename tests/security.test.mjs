import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('private artifacts and the original image are excluded from Git', () => {
  const ignore = readFileSync('.gitignore', 'utf8');
  for (const path of ['qa-artifacts/', '.env', '.DS_Store', 'assets/avatar.png', '.github/workflows/telegram-daily-message.yml']) {
    assert.ok(ignore.split('\n').includes(path), path);
  }
});

test('workflow uses immutable action references and read-only permissions', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(match[1], /^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
  }
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\./);
  assert.match(workflow, /persist-credentials: false/);
});

test('CI avoids working-branch push duplicates while preserving PR and manual checks', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const triggers = workflow.match(/^on:\n([\s\S]*?)(?=^\S)/m)?.[1];
  assert.ok(triggers, 'workflow has explicit triggers');
  assert.deepEqual([...triggers.matchAll(/^  (\w+):/gm)].map(match => match[1]), ['push', 'pull_request', 'workflow_dispatch']);
  assert.match(triggers, /^  push:\n    branches: \[main\]$/m);
  assert.match(triggers, /^  pull_request:\n    branches: \[main\]$/m);
  assert.doesNotMatch(triggers, /paths|types|branches-ignore/, 'required PR checks must not be silently filtered out');
  assert.match(workflow, /group: website-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /name: quality/);
  assert.match(workflow, /name: browser-regression/);
  assert.match(workflow, /run: npm run test:browser/);
});

test('main allows regular merge commits without weakening repository protection', () => {
  const ruleset = JSON.parse(readFileSync('.github/main-ruleset.json', 'utf8'));
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.bypass_actors, []);
  assert.deepEqual(ruleset.conditions.ref_name, { include: ['refs/heads/main'], exclude: [] });
  for (const type of ['deletion', 'non_fast_forward']) {
    assert.ok(ruleset.rules.some(rule => rule.type === type), type);
  }
  assert.ok(!ruleset.rules.some(rule => rule.type === 'required_linear_history'));
  const pullRequest = ruleset.rules.find(rule => rule.type === 'pull_request');
  assert.deepEqual(pullRequest.parameters.allowed_merge_methods, ['merge']);
  assert.equal(pullRequest.parameters.required_review_thread_resolution, true);
  const checks = ruleset.rules.find(rule => rule.type === 'required_status_checks');
  assert.equal(checks.parameters.strict_required_status_checks_policy, true);
  assert.equal(checks.parameters.do_not_enforce_on_create, false);
  assert.deepEqual(checks.parameters.required_status_checks.map(check => check.context).sort(), ['browser-regression', 'quality']);

  // The maintainer command must not restore the previous squash-only policy.
  const configuration = readFileSync('scripts/configure-github.mjs', 'utf8');
  assert.match(configuration, /allow_merge_commit: true/);
  assert.match(configuration, /allow_squash_merge: false/);
  assert.match(configuration, /allow_rebase_merge: false/);
  assert.doesNotMatch(configuration, /squashOnly|allow_merge_commit: false|allow_squash_merge: true/);
});
