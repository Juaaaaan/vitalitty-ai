# Husky Git Hooks

This directory contains Git hooks that enforce code quality and consistency.

## Available Hooks

### pre-commit
Runs before each commit:
- Lints and fixes staged files using ESLint
- Runs formatting with Prettier

Disable: `git commit --no-verify` or `HUSKY=0 git commit`

### commit-msg
Runs after commit message is written:
- Validates commit message is not empty
- Enforces minimum message length (3 characters)

Disable: `git commit --no-verify` or `HUSKY=0 git commit`

### prepare-commit-msg
Runs before the commit message editor opens:
- Can be customized to add commit message templates
- Currently a minimal implementation

### pre-push
Runs before pushing to remote:
- Runs ESLint to check code quality
- Runs full test suite

Disable: `git push --no-verify` or `HUSKY=0 git push`

## Configuration Files

- `.lintstagedrc.json` - Lint-staged configuration for file-specific linting
- `.husky/` - Directory containing hook scripts

## Disabling Hooks Temporarily

For a single command:
```bash
git commit -m "message" --no-verify
git push --no-verify
```

For multiple commands:
```bash
export HUSKY=0
git commit -m "message"
git push
unset HUSKY
```

Globally disable in `~/.config/husky/init.sh` (not recommended for team projects).

## Customizing Hooks

Edit the scripts in this directory to add more checks or integrate with other tools.

Common tools to integrate:
- [Commitlint](https://commitlint.js.org/) - Enforce commit message format
- [Lint-staged](https://github.com/lint-staged/lint-staged) - Run linters on staged files
- [TypeScript](https://www.typescriptlang.org/) - Type checking

## References

- [Husky Documentation](https://typicode.github.io/husky)
- [Git Hooks](https://git-scm.com/docs/githooks)
