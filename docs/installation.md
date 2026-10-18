# Installation and setup

[Start here](../README.md) · [Authoring guide](authoring.md)

## Installation

Most courses install the [CTM Assessment](https://github.com/Erasmus-CTM/ctm-assessment)
package, which contains py-exercise with tested versions of the other
components. To use py-exercise on its own:

```bash
quarto add Erasmus-CTM/py-exercise
```

```yaml
filters: [py-exercise]
```

Requirements: Quarto 1.8.27 (the tested version). Students' browsers download
Pyodide 0.27.2 and the Monaco editor from jsDelivr; editors appear when Monaco
is ready and the first **Check** waits for Python.

| Optional feature | Install | If missing |
|---|---|---|
| Feedback (`py-exercise: feedback: true`) | `quarto add Erasmus-CTM/ai-feedback` | Rendering stops with a message naming this command. Without `feedback: true` it is not needed. |
| Shared runtime with interactive Pyodide cells | [pyodide-interaktiv](https://github.com/Erasmus-CTM/pyodide-interaktiv) | py-exercise loads its own Pyodide. With pyodide-interaktiv on the page it reuses that runtime. |

---


## Feedback setup

For feedback directly on the page, follow the [shared connection guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/installation.md#provider-settings-and-data-sent). Without a connection, Feedback prepares a message to copy into an AI chat.

## Enable feedback in an HTML page

```yaml
filters: [py-exercise]
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
