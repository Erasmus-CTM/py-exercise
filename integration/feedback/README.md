# Shared feedback integration workbench

This is the setup and test scaffold for the first shared-feedback consumer,
**py-exercise**. It does not yet change any exercise's runtime or feedback policy.
The migration sequence is py-exercise, Pyodide, then mathematics.

## One-command setup

Requirements: Python 3.12+, Git, Node 22/npm, and Quarto **1.8.27**.
For the mathematics regression tests, install `sympy==1.14.0` and
`networkx==3.4.2` in the Python environment used by `python` (or set `PYTHON`).

From a Git checkout of this branch:

```sh
python scripts/setup-feedback-integration.py --test
python -m http.server 8000 --directory .feedback-workspace/site/_site
```

Open <http://localhost:8000>. Do not open the HTML as a local file: the worker,
Monaco editor and Pyodide require an HTTP origin. The generated page contains
all four extensions and links to the exact revisions used for the build.

## Branches and reproducibility

`repos.json` is the setup manifest:

| Repository | Selected branch | Default revision |
|---|---|---|
| ai-feedback | `feature/clear-example-instructions` | Pinned phase 1 follow-up commit |
| py-exercise | `feature/shared-feedback-integration` | The current local checkout (`self`) |
| math-exercise | `main` | Pinned pre-migration commit |
| pyodide-interaktiv | `main` | Pinned pre-migration commit |

The script downloads source archives for exact commits, copies their extension
folders into the generated site's `_extensions`, and records each repository's
SHA plus every copied extension file's SHA-256 in `resolved-repos.json`.
It does not overwrite or change upstream working trees. Local py-exercise edits
are included and listed as dirty files so a development run is not confused
with a clean committed result. CI uses its checked-out PR/push revision.

To resolve the configured **external branch tips** instead of pins, use:

```sh
python scripts/setup-feedback-integration.py --refresh --test
```

The resulting revision record is your reproducibility record. Update the
manifest's pins intentionally when a migration branch becomes the new baseline.
`--refresh` does not rewrite the manifest or pull over local edits.

To test local work from a different repository:

```sh
python scripts/setup-feedback-integration.py \
  --source ai-feedback=../ai-feedback \
  --source math-exercise=../math-exercise \
  --test
```

Each override must be a Git checkout. The record includes its actual commit and
dirty-file list. `--workspace PATH` selects a separate generated workspace.
Only a workspace marked by this script can be rebuilt; unrelated nonempty
folders are rejected.

## Real browser checks

After the first setup, install the test browser:

```sh
cd integration/feedback
npm ci
npx playwright install chromium
cd ../..
python scripts/setup-feedback-integration.py --test --browser
```

CI also installs Chromium system dependencies. `CHROMIUM_EXECUTABLE` can select
an already installed Chromium binary. The browser test uses real Monaco,
Pyodide and SymPy loaded from their extension-configured CDNs; it fails if they
cannot load. It does not replace Python execution with a mock.

Checks cover:

- All four filters rendering together, local assets resolving, shared runtime
  loaded once, and exact revision/file records.
- Shared text feedback generating a copy prompt without provider requests or
  leaking other exercises' tests.
- Python starter failures, a corrected response passing all tests, forbidden
  imports being rejected, and Reset restoring the starter.
- Mathematics accepting the correct answer and interactive Python printing 6.
- Shared feedback and its settings dialog still working beside all consumers.
- Existing ai-feedback and math-exercise regression suites.

The workflow saves the rendered common page, screenshot, browser report and
revision record as a `feedback-integration` artifact. It does not deploy a site.

## What remains for the migration PRs

py-exercise still has no AI Feedback button. Mathematics and Pyodide still use
legacy provider/settings code. Their presence together is a compatibility
baseline, not a claim that the settings are already unified.

The next implementation must add code-matched checker snapshots, exclude stale
output and hidden test source, preserve Check/Reset/submission, and connect
py-exercise to the shared API/cogwheel without rerunning code for feedback.
Then extend this common page's tests to cover that behavior. Live provider
quality and institutional VPN/CORS access require a separate manual check.
