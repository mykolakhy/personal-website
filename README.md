# Mykola Khytra - personal website

Static portfolio for a Senior QA Engineer. Website improvements are being implemented on a pull-request branch; repository setup is the initial baseline.

## Workflow

- `main` is protected: changes go through pull requests and CI.
- GitHub Actions are SHA-pinned, allowlisted and read-only by default.
- Private notes, local QA artifacts, credentials and original image metadata must not enter Git history or deployment output.
- Public repository does not mean public deployment. Hosting and the production domain are a separate decision.

See [the implementation milestones](docs/IMPLEMENTATION-PLAN.md).

## Checks

Use Node.js 24 or newer and run `npm test`.

## Rights

Personal copy, photographs and branding remain the property of their respective owners. No open-source license is granted by publishing this repository.
