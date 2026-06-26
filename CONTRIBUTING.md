# Contributing to Privault

Thanks for your interest in Privault. The project is currently in early
single-author development and the surface area for external contributions
is intentionally small.

## What I'm looking for

- **Security review** of the cryptographic design — open an issue, do not
  email. Specific concern areas: KEK derivation, RSA wrapping, share-link
  key handling, recovery phrase storage.
- **Bug reports** with a reproduction. Please include browser, OS, and the
  exact steps to reproduce.
- **Documentation fixes** — typos, unclear sections, missing context.

## What I'm not accepting right now

- Large refactors or rewrites
- New product features not in the roadmap
- Dependency upgrades unless they fix a security issue

## How to file a security issue

**Do not** open a public GitHub issue for security-sensitive bugs. Email
`security@localprivault.com` with a description and a proof-of-concept.
You will receive an acknowledgment within 72 hours.

## Code of conduct

Be technical, not personal. Disagree with ideas, not people. We're all
here because encryption is hard and worth getting right.