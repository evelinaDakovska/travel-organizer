Intentionally empty.

`core.hooksPath` is set to this directory for this repo only, which overrides the global
`~/.git-hooks` (a GitGuardian `ggshield secret scan` pre-commit hook configured for work).

This is a personal repo with no secrets and no backend credentials. Work repos are unaffected —
the override is repo-local, set in `.git/config`, and is not committed.
