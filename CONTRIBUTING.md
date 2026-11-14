# Contributing

Contributions are welcome through pull requests.

## Code

- Python follows PEP 8. Ruff formats and checks the code; its settings are in `api/pyproject.toml`.
- Every function carries type annotations, which mypy verifies in strict mode, and a documentation
  string in the numpydoc form. A function that computes a scientific result also documents its
  parameters and its results, with their units.
- TypeScript is compiled in strict mode. Prettier formats the code and ESLint checks it; their
  settings are in `web/`.
- Every function that computes a result has a test.
- Every input is validated, every warning of a checker counts as an error, and no outside program
  is added for what the language already provides.

Run the checks listed in [README.md](README.md) before opening a pull request.

## Commits

Write the subject of a commit in the imperative, in at most 72 characters, and describe one change
in each commit.

## Changes

Record every notable change in [CHANGELOG.md](CHANGELOG.md).
