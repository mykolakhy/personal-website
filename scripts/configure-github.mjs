import { execFileSync } from 'node:child_process';

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
  note: 'Main-branch rules are a separate step. Private-repository enforcement depends on the GitHub plan. Visibility was not changed.',
}, null, 2));
