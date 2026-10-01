# Security

Report vulnerabilities privately to mykola.m.khytra@gmail.com. Do not include credentials or private data in a public issue.

## Boundaries

- This is a static website, not an authenticated application or backend.
- CI uses read-only repository permissions, SHA-pinned allowlisted actions and no deployment credentials.
- Changes to main require pull requests, resolved conversations and passing CI. Force pushes and branch deletion are blocked, without bypass actors.
- Pull requests use regular merge commits to preserve individual commits; squash and rebase merging are disabled.
- There is one owner. Required external approvals are intentionally not enabled, since an author cannot approve their own PR and no other reviewer has been authorized.
- GitHub secret scanning/push protection and Dependabot alerts are additional safeguards, not proof that all secrets or vulnerabilities are absent.
- Account 2FA/recovery settings have not been changed. The owner should maintain 2FA and secure recovery methods.
- Git history and CI logs are public. Only material approved for public distribution belongs here.
