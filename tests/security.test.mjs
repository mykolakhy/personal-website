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
