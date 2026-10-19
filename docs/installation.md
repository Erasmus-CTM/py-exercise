# Installation and setup

[Start here](../README.md) · [Authoring guide](authoring.md)

## Installation

py-exercise is a part of [CTM Assessment](https://github.com/Erasmus-CTM/ctm-assessment),
which installs it together with AI feedback, the mathematics exercises and
the Python extensions at versions tested together. Install and list only the
package:

```bash
quarto add https://erasmus-ctm.github.io/ctm-assessment/ctm-assessment.tar.gz
```

```yaml
filters: [ctm-assessment]
```

py-exercise uses CTM Assessment's library ctm-libs for its settings, its
languages, the page's Python runtime and AI feedback. Without the package a
page with py-exercise stops rendering with the install command above.

Requirements: Quarto 1.8.27 or later (the earliest version tested). Students' browsers download
Pyodide 0.28.3 and the Monaco editor from jsDelivr; editors appear when Monaco
is ready and the first **Check** waits for Python. The exercise scripts and
styles are files the browser caches, loaded once per page.

**Quarto 1.10:** this release sends pages with blocks such as
`{math-exercise}`, `{py-exercise}` or `{pyodide-python}` to Jupyter (an
upstream regression, reported). Until it is fixed, add `engine: markdown` to
the front matter of each such page (in `_quarto.yml` it has no effect), or use
Quarto 1.8.

| Optional feature | What it needs | Notes |
|---|---|---|
| Feedback (`py-exercise: feedback: true`) | nothing: AI feedback is part of CTM Assessment | A site built without AI feedback (`ai-feedback: enabled: false`) has none; the page is named in one build message. |
| Shared runtime with interactive Pyodide cells | [pyodide-interaktiv](https://github.com/Erasmus-CTM/pyodide-interaktiv), part of CTM Assessment | py-exercise loads its own Pyodide. With pyodide-interaktiv on the page it reuses that runtime. |

Invalid exercise source stops rendering with a message, for example an
exercise without `#| task:` while feedback is on. Before 0.3.0 these messages
were printed but the render continued and published a broken exercise.

AI feedback is loaded only when used: when `feedback: true` is set or the page
has `::: {.ai-feedback}` activities.

---


## Feedback setup

For feedback directly on the page, follow the [connection guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.

## Enable feedback in an HTML page

```yaml
filters: [ctm-assessment]
ai-feedback:
  mode: copy
py-exercise:
  feedback: true
```

Add a `#| task:` line to each exercise so feedback knows what students are being asked to do.

## Published examples

[Standalone activities](https://erasmus-ctm.github.io/py-exercise/example.html),
[full practice session](https://erasmus-ctm.github.io/py-exercise/example-en.html),
and [minimal example](https://erasmus-ctm.github.io/py-exercise/example-mini.html)
are built and published from `main` by GitHub Actions after the example checks
pass.

## Development of py-exercise

The repository builds and tests py-exercise without the CTM Assessment
package, against a ctm-libs installation (git-ignored here):

```bash
quarto add Erasmus-CTM/ctm-libs@main --no-prompt     # or a checkout: quarto add ../ctm-libs --no-prompt
CTM_COMPONENT_DEV=1 quarto render example.qmd
```

`CTM_COMPONENT_DEV=1` tells the component's `ctm-bootstrap.lua` (a copy of
ctm-libs' `bootstrap/ctm-bootstrap.lua`, kept byte-identical) that this is a
development build; without it the render stops because the package is
missing. The tests read ctm-libs' files from `CTM_LIBS_EXTENSION` (for example
`_extensions/Erasmus-CTM/ctm-libs`; without the variable they look in
`_extensions/`) and render their projects with `CTM_COMPONENT_DEV=1`; see
[Tests](reference.md#tests). CI does the same with the ctm-libs commit under
test (the `CTM-Review-Refs` trailer of a review commit, else ctm-libs `main`).
