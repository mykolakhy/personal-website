import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Repository-scoped hardening. Never changes account security or visibility.
const repository = 'mykolakhy/personal-website';
const prefix = `repos/${repository}`;
function api(endpoint, method = 'GET', body) {
  const args = ['api', endpoint, '--method', method, '-H', 'Accept: application/vnd.github+json'];
  if (body) args.push('--input', '-');
  const result = execFileSync('gh', args, { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8' });
  return result.trim() ? JSON.parse(result) : null;
}

const before = api(prefix);
if (before.full_name !== repository || !before.permissions?.admin) {
  throw new Error('Repository identity or admin permission check failed.');
}

api(prefix, 'PATCH', {
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_squash_merge: true,
  delete_branch_on_merge: true,
  allow_auto_merge: false,
});
api(`${prefix}/actions/permissions`, 'PUT', {
  enabled: true,
  allowed_actions: 'selected',
  sha_pinning_required: true,
});
api(`${prefix}/actions/permissions/selected-actions`, 'PUT', {
  github_owned_allowed: false,
  verified_allowed: false,
  patterns_allowed: ['actions/checkout@*', 'actions/setup-node@*', 'actions/upload-artifact@*'],
});
api(`${prefix}/actions/permissions/workflow`, 'PUT', {
  default_workflow_permissions: 'read',
  can_approve_pull_request_reviews: false,
});
api(`${prefix}/vulnerability-alerts`, 'PUT');
api(`${prefix}/automated-security-fixes`, 'PUT');
if (!before.private) {
  api(prefix, 'PATCH', { security_and_analysis: {
    secret_scanning: { status: 'enabled' },
    secret_scanning_push_protection: { status: 'enabled' },
  } });
  api(`${prefix}/private-vulnerability-reporting`, 'PUT');
  api(`${prefix}/actions/permissions/fork-pr-contributor-approval`, 'PUT', { approval_policy: 'all_external_contributors' });
}

if (process.argv.includes('--protect-main')) {
  const checkRuns = api(`${prefix}/commits/main/check-runs`).check_runs;
  const integrationId = checkRuns.find(check => check.app?.slug === 'github-actions')?.app.id;
  if (!Number.isInteger(integrationId)) throw new Error('Wait for the baseline Actions check before binding required checks to its verified app ID.');
  const rules = JSON.parse(readFileSync(new URL('../.github/main-ruleset.json', import.meta.url), 'utf8'));
  for (const rule of rules.rules) {
    if (rule.type === 'required_status_checks') {
      rule.parameters.required_status_checks.forEach(check => { check.integration_id = integrationId; });
    }
  }
  const existing = api(`${prefix}/rulesets`).find(rule => rule.name === rules.name);
  api(existing ? `${prefix}/rulesets/${existing.id}` : `${prefix}/rulesets`, existing ? 'PUT' : 'POST', rules);
}

const after = api(prefix);
console.log(JSON.stringify({
  repository: after.full_name,
  private: after.private,
  defaultBranch: after.default_branch,
  squashOnly: !after.allow_merge_commit && !after.allow_rebase_merge && after.allow_squash_merge,
  deleteBranchOnMerge: after.delete_branch_on_merge,
  actions: api(`${prefix}/actions/permissions`),
  allowedActions: api(`${prefix}/actions/permissions/selected-actions`),
  workflowPermissions: api(`${prefix}/actions/permissions/workflow`),
  security: after.security_and_analysis,
  mainRules: process.argv.includes('--protect-main') ? api(`${prefix}/rules/branches/main`) : 'Not requested',
  note: 'Visibility and account settings were not changed. Rules apply to administrators too; there are no bypass actors.',
}, null, 2));
