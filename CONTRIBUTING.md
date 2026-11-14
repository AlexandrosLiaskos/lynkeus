# Contributing

Contributions are welcome through pull requests. The branch `main` receives a change only through a
pull request whose checks have passed.

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

## Parts

The code has three parts, and each folder belongs to one of them.

| Part | Folders |
|---|---|
| Map | `web/src/map/`, `web/src/contents/`, `web/src/statusbar/`, `web/src/view/`, `web/src/share/` |
| Data | `web/src/data/`, `web/src/catalog/`, `api/src/lynkeus/` except `analysis/` |
| Analysis | `web/src/analysis/`, `web/src/help/`, `api/src/lynkeus/analysis/`, `api/tests/analysis/`, `docs/methods/` |

A change stays inside the folders of one part. The files that the parts share are changed only by the
maintainer, who also adds every new library: `web/src/App.tsx`, `web/src/styles.scss`, `web/src/ribbon/`,
`web/src/header/`, `web/src/shared/`, the package files, and the files outside `web/src/` and `api/src/`.

A tab of the ribbon is declared in its own folder. The file `tab.ts` lists its groups and buttons, and
`actions.ts` gives the action of each finished button. A button without an action is shown in grey, so a
button receives its action only when its function is finished.

## Research and proof

Nothing invented, assumed or left as a placeholder enters `main`. Before a function is built, its sources
are recorded in the research note of its part, in `docs/research/`. The method of each analysis tool is
described in a sheet in `docs/methods/`. The description of a pull request states the sources used, what
was tried on real data, the comparison with a reference, and what is not yet confirmed.

## Commits

Write the subject of a commit in the imperative, in at most 72 characters, and describe one change
in each commit.

## Changes

Record every notable change in [CHANGELOG.md](CHANGELOG.md).
