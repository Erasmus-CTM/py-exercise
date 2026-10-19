# Detailed functionality reference

[Start here](../README.md) · [Authoring guide](authoring.md)

## Usage

py-exercise is a part of CTM Assessment ([installation](installation.md));
list the package's filter. No additional filter is needed – Pyodide and
Monaco Editor are automatically loaded from a CDN:

```yaml
filters:
  - ctm-assessment
```

---

## Basic Syntax

````markdown
```{py-exercise}
#| label: task-1
#| caption: Implement addition
def add(a, b):
    pass

## TESTS ##
assert add(1, 2) == 3,   "add(1, 2) should return 3"
assert add(0, 0) == 0,   "add(0, 0) should return 0"
assert add(-1, 1) == 0,  "add(-1, 1) should return 0"
```
````

Everything **above** `## TESTS ##` is shown to the student.
Everything **below** is hidden and checked automatically after running the code.

---

## Cell Options (`#|`)

| Option | Type | Default | Description |
|--------|-----|----------|--------------|
| `label` | String | `py-exercise-N` | Unique ID of the exercise |
| `caption` | String | — | Name stored with the exercise in the JSON download; it is not displayed on the page |
| `forbidden-imports` | comma-separated | — | Forbidden `import` statements (top-level module name) |
| `forbidden-keywords` | comma-separated | — | Forbidden function or method names such as `sum` or `sort` (`sort` forbids both `sort(x)` and `x.sort()`; write names without a leading dot), and the statements `for`, `while`, `with`, `lambda`, `class`, `global`, `nonlocal`, `try`, `raise`, `del`, `assert`, `yield` |
| `show-test-hints` | `true` / `false` | `true` | Show the assertion message on failure |

---

## Global Options (YAML Frontmatter)

Apply to all exercises in the document, can be overridden at the cell level:

```yaml
py-exercise:
  forbidden-imports: [os, sys, subprocess]
  forbidden-keywords: [for, while, sorted]
  show-test-hints: true
  submission: true
  submission-key: "my-secret-key"
  lang: en
```

| Option | Default | Description |
|--------|----------|--------------|
| `forbidden-imports` | `[]` | Forbidden imports for all exercises (a list, or comma-separated) |
| `forbidden-keywords` | `[]` | Forbidden keywords for all exercises (a list, or comma-separated) |
| `show-test-hints` | `true` | Show the assertion message on failed tests |
| `submission` | `false` | Enable submission mode |
| `submission-key` | `"py-exercise"` | XOR key used to encode results |
| `lang` | `ctm-assessment: lang`, then `lang`, then `"en"` | UI language (`"en"`, `"de"` or `"nb"`) |
| `feedback` | `false` | AI feedback for the exercises ([below](#shared-feedback)) |
| `stop-after` | `ctm-assessment: stop-after`, then `20` | Seconds before a running check offers **Stop** |

The options combine key by key across `_quarto.yml`, profiles,
`_quarto.yml.local`, `_metadata.yml` files and the page's front matter: a page
that sets one option keeps the project's other options.
`ctm-assessment: {lang: nb, stop-after: 30}` sets the language and Stop time
of every CTM Assessment component at once; `py-exercise:` overrides them for
this component. `show-test-hints`, `submission` and `feedback` take `true` or
`false`; another value warns and uses the default (it becomes an error in CTM
Assessment 1.0).

---

## UI Language

Currently supported: **English (`en`)**, **German (`de`)** and **Norwegian
Bokmål (`nb`)**. **The default is English** – without any setting, the UI
appears in English.

The extension reads the language in this order:

1. `py-exercise: lang:` – explicit override
2. `ctm-assessment: lang:` – the language of every CTM Assessment component
3. **Quarto's own `lang:`** – the normal case
4. `en` – fallback

Quarto's standard key is therefore enough; no extra option is needed:

```yaml
---
title: "Python Exercises"
lang: de
filters:
  - ctm-assessment
---
```

Regional variants are shortened (`de-DE` → `de`); Norwegian `no` and Nynorsk
`nn` get the Bokmål interface (before py-exercise 0.4.0, English). An
unsupported language (e.g. `fr`) silently falls back to English and does
**not** break rendering.

Buttons, test results, the submission and download sections, and the rule-check
messages (forbidden imports, etc.) are all translated – the latter are passed
into the Python environment for that purpose.

### Multilingual Projects

Since the language comes from Quarto's `lang:`, the extension works with
multilingual setups without any extra effort. When building via Quarto
profiles, one `lang:` per profile is enough:

```yaml
# _quarto-de.yml
project:
  output-dir: docs/de
lang: de
```

```yaml
# _quarto-en.yml
project:
  output-dir: docs/en
lang: en
```

Each language is a separate render pass; the text is then fixed in the
respective HTML output. A language switcher that links to the other version
therefore automatically switches the extension's language as well.

### Adding Another Language

The interface texts are in CTM Assessment's message catalogue, in ctm-libs
(`locales/py-exercise.js`, shared with the other components' catalogues). A
new language is added there with all its texts; see ctm-libs'
[development guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/development.md#messages).

---

## Rule Checking

If a student uses a forbidden construct, the code is **not executed** and an
error message is shown instead.

```yaml
# Per exercise:
#| forbidden-imports: os, sys
#| forbidden-keywords: for, while, lambda
```

Typical use cases:
- Forbidding `for`/`while` → the solution must use a list comprehension, `map`
  or recursion (comprehensions are not `for` statements and remain allowed)
- Forbidding `sorted` → a custom sorting algorithm is required
- Forbidding `math` → students practise a formula instead of using a library

The check reads the student's code before it runs. It recognises direct calls
(`sum(x)`, `x.sort()`) and the listed statements; other words, such as `if` or
`return`, are ignored. It is a teaching restriction, not a security boundary:
indirect forms such as `f = sum`, `__import__("math")` or `exec(...)` are not
detected. If an exercise requires a particular method (for example recursion),
add a test that checks it.

---

## Submission Mode

Submission export and JSON download serve different purposes. An encoded
submission is a course hand-in format; JSON is an ordinary downloadable record
of the code and results. Neither is a secure examination mechanism.

### Collect an encoded submission

The submission header and the **Export results** button are
enabled by setting `submission: true` in the document front matter. Students
enter their Student ID and Quiz ID, then click the button to get an encoded
string to submit.

The encoded string can be decoded by the instructor with the following
function (the repository's `decode.py` asks for the key and string and prints
the decoded JSON):

```python
import json, base64

def decode_submission(encoded: str, key: str = "py-exercise") -> dict:
    key_bytes = key.encode("utf-8")
    xored     = base64.b64decode(encoded)
    raw       = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(xored))
    return json.loads(raw.decode("utf-8"))

data = decode_submission("...", key="demo-key-2026")
print(data["sid"], data["results"])
```

### Download code and results as JSON

The **Download as JSON** button saves the current editor
content and test results of every exercise to a local file — for personal
documentation. No server is involved.

The download is always available, regardless of whether submission mode is
enabled.


## Test Output

Each top-level statement below `## TESTS ##` is run and reported as one test,
in the same namespace as the student's code. Put helper imports or set-up
inside the assertion (or inside one `with`/`try` block) so that they are not
counted as passed tests. After running, each test shows:

- ✓ **Test n** – test succeeded
- ✗ **Test n** – with the assertion message (if `show-test-hints: true`)

The assertion message is the text after the comma in `assert ..., "message"`.
A test without a message shows "Assertion failed"; a test that raises another
error shows that error. If `show-test-hints: false` is set, students only see
whether a test failed, without a hint as to why. Output printed by the
student's code is shown above the results; output printed while the tests run
is not shown, so capture it in the test if it should be checked.

---

## Full Example

````markdown
---
title: "Python Exercises – SoSe 2025"
filters:
  - ctm-assessment
py-exercise:
  submission: true
  submission-key: "sose25-final"
  lang: en
---

Implement a recursive function `fib(n)` that returns the n-th
Fibonacci number (fib(0) = 0, fib(1) = 1).

```{py-exercise}
#| label: fibonacci
#| caption: Fibonacci sequence
#| forbidden-keywords: for, while
def fib(n):
    pass

## TESTS ##
assert fib(0) == 0,  "fib(0) should return 0"
assert fib(1) == 1,  "fib(1) should return 1"
assert fib(6) == 8,  "fib(6) should return 8"
assert fib(10) == 55, "fib(10) should return 55"
```
````

---

## Dependencies

| Dependency | Purpose |
|---|---|
| Pyodide 0.28.3 (CDN) | Loaded automatically through CTM Assessment's shared runtime (ctm-libs); one runtime per page, shared with math-exercise and pyodide-interaktiv. A load that does not finish within 180 s shows a message, and the next **Check** tries again. |
| Monaco Editor 0.46 (CDN) | Loaded automatically; if it takes longer than 60 s a message appears, replaced by the editors if they still arrive. |

### Tests

The tests need ctm-libs, the library of CTM Assessment, installed for a
[development build](installation.md#development-of-py-exercise).
`npm ci && npm test` runs the browser-runtime tests (jsdom) and, when Quarto is
installed, the render tests; `python -m unittest discover -s tests`
challenges the published examples and checks the isolation of learner code.
Both read ctm-libs' files from `CTM_LIBS_EXTENSION` (without it, from
`_extensions/ctm-libs` or `_extensions/<owner>/ctm-libs`).
In VS Code, **Terminal → Run Task…** offers the same commands
(`.vscode/tasks.json`): the default test task runs the tests, the default build
task renders the example and then tests.

### What learner code can change

Each **Check** runs the learner's program in a fresh namespace, so nothing
from an earlier check or from interactive Pyodide cells leaks in, and the
checker's own code lives in a private module (`_ctm_py_exercise`), not in the
namespace the interactive cells share. Interpreter state the program changes
(`builtins`, `sys.stdout`/`stdin`/`stderr`, the recursion limit, `sys.path`,
the working directory, the CTM modules in `sys.modules`) is restored after
the check, so one exercise cannot break another or a mathematics exercise on
the page. `sys.exit()` in learner code or tests is reported, not raised.

Grading happens in the learner's browser: the tests are part of the page and a
determined learner can read them or fake a result. Use it for practice, not
for high-stakes assessment. A program that never ends (an endless loop) cannot
be interrupted when Python runs on the page itself; the page has to be
reloaded. When pyodide-interaktiv is on the page, Python runs in a worker: a
check that runs longer than 20 s offers **Stop**, which restarts Python for the
whole page. Loading Python and packages is not counted; a load that has not
finished after 180 s offers Stop, or ends with a message while Python is still
starting. Change the time with `py-exercise: {stop-after: 30}` (seconds), or
for all CTM components of a project with `ctm-assessment: {stop-after: 30}`.
A check interrupted by an interactive cell's Stop or restart is repeated once
on the new runtime. As before, `if __name__ == "__main__":` blocks do not run
during a check.

The page's Python runtime (Stop, the load limit, the shared interpreter
guard) is ctm-libs' `runtime/pyodide-runtime.js`, loaded once per page for
all components; change it there.

---

## Shared feedback integration

AI feedback is part of CTM Assessment; enable it for the exercises with:

```yaml
py-exercise:
  feedback: true
```

Supply `#| task: ...` in each Python cell with the learner's assignment. Optional
`#| feedback-language: en` and `#| learner-level: ...` configure the feedback.
Each editor then gets **Feedback** and the shared settings cogwheel. Feedback
uses current code without executing it. Checker summaries and learner output
are included only after checking that exact code; edits and Reset invalidate
them. Hidden test source, assertion messages, tracebacks and submission details
are excluded. Without `feedback: true`, existing checker behavior is unchanged.
A site built without AI feedback (`ai-feedback: enabled: false`, for example
in a profile, or `CTM_FEEDBACK=off quarto render`) has no Feedback button and
nothing that only feedback reads (task, learner level); a page that sets
`feedback: true` is named in one build message, and `#| task:` is still
required, so both builds fail alike.

Cross-integration examples and acceptance tests live in
[Erasmus-CTM/ctm-assessment](https://github.com/Erasmus-CTM/ctm-assessment).

## Configurable shared teaching policies

AI feedback loads named definitions from `ai-feedback: policy-files:` (the
files of the project, profiles, `_metadata.yml` and the page add up) and
selects one with `ai-feedback: policy:` (the nearest setting wins); policies
use `base-prompt`, `step-prompt` and named `extends` inheritance. Loading
policy files only registers definitions. The earlier keys `project-policy`,
`page-policy` and `page-policy-files` keep working in CTM Assessment 0.9 with a
build warning. See the [shared policy guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/feedback-policies.md).

## Shared dependency and learning context

py-exercise loads AI feedback from ctm-libs, CTM Assessment's library, when
`py-exercise: feedback: true` is set; nothing is copied into this extension.
Omitted `context` collects preceding section prose; `context: none` opts out;
`context: id1,id2` selects tagged `.ai-context` blocks reusable by text, math
and Pyodide activities, followed by the prose of the exercise's own section
without those blocks. `feedback-context` is an alias. See the
[shared guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/reference.md)
for policies, limits, evidence boundaries and settings.

### Standalone example

`example.qmd` demonstrates this package with shared feedback. In a [development setup](installation.md#development-of-py-exercise) run `CTM_COMPONENT_DEV=1 quarto render example.qmd`; no other integration extension is required. The example builds automatically on pushes and pull requests; download the `standalone-example` Actions artifact. Feedback defaults to copy mode, which needs no API key.

### Page and exercise feedback policies

Put teaching policy definitions in YAML files and activate them explicitly with
`policy` or a cell's `#| feedback-policy: name`. A policy file registers
definitions; `policy-files` alone does not change page behavior. The same
named policy can be reused across integrations.

YAML `ai-feedback.exercises.<integration>.<label>` targets one authored label;
an explicit named selection takes precedence over that entry. Omitted settings
inherit; `steps` replaces the entire list. See the
[shared policy guide](https://github.com/Erasmus-CTM/ctm-libs/blob/main/docs/feedback-policies.md).
