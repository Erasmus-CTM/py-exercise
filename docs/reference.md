# Detailed functionality reference

[Start here](../README.md) · [Authoring guide](authoring.md)

## Usage

No additional filter needed – Pyodide and Monaco Editor are automatically
loaded from a CDN:

```yaml
filters:
  - Erasmus-CTM/py-exercise
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
| `forbidden-imports` | `[]` | Forbidden imports for all exercises |
| `forbidden-keywords` | `[]` | Forbidden keywords for all exercises |
| `show-test-hints` | `true` | Show the assertion message on failed tests |
| `submission` | `false` | Enable submission mode |
| `submission-key` | `"py-exercise"` | XOR key used to encode results |
| `lang` | `"en"` | UI language (`"de"` or `"en"`) |

---

## UI Language

Currently supported: **German (`de`)** and **English (`en`)**.
**The default is English** – without any setting, the UI appears in English.

The extension reads the language in this order:

1. `py-exercise: lang:` – explicit override
2. **Quarto's own `lang:`** – the normal case
3. `en` – fallback

Quarto's standard key is therefore enough; no extra option is needed:

```yaml
---
title: "Python Exercises"
lang: de
filters:
  - Erasmus-CTM/py-exercise
---
```

Regional variants are shortened (`de-DE` → `de`). An unsupported language
(e.g. `fr`) silently falls back to English and does **not** break rendering.

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

1. In `_extensions/py-exercise/py-exercise.js`, add a `LOCALES` block modeled
   on `de` (copy all keys).
2. In `py-exercise.lua`, add the language code to `supportedLangs` and extend
   the `noscriptMessages` table.

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
  - Erasmus-CTM/py-exercise
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
| Pyodide 0.27.2 (CDN) | Loaded automatically; one runtime per page, shared with math-exercise and pyodide-interaktiv. A load that does not finish within 180 s shows a message, and the next **Check** tries again. |
| Monaco Editor 0.46.0 (CDN) | Loaded automatically; if it takes longer than 60 s a message appears, replaced by the editors if they still arrive. |

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
check that runs longer than 10 s offers **Stop**, which restarts Python for the
whole page.

`_extensions/py-exercise/shared/pyodide-runtime.js` is a byte-identical copy
of math-exercise's file of the same name (the CTM Assessment build checks
this); change it there first.

---

## Shared feedback integration

Install the shared `ai-feedback` extension alongside `py-exercise`, then enable:

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

Cross-integration examples and acceptance tests live in
[Erasmus-CTM/ctm-assessment](https://github.com/Erasmus-CTM/ctm-assessment).

## Configurable shared teaching policies

AI Feedback 0.8 uses explicit `page-policy`/`project-policy` selection,
`base-prompt`, `step-prompt` and named `extends` inheritance. Loading policy files
only registers definitions. See the [shared policy guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/feedback-policies.md).

## Shared dependency and learning context

Install ai-feedback once in the project; `py-exercise: feedback: true` loads it
automatically. Shared feedback requires ai-feedback 0.8.0 or later.
No shared runtime is copied into this plugin. Omitted `context` collects preceding
section prose; `context: none` opts out; `context: id1,id2` selects tagged
`.ai-context` blocks reusable by text, math and Pyodide activities.
`feedback-context` is an alias. See the
[shared guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/README.md)
for policies, limits, evidence boundaries and settings.

### Standalone example

`example.qmd` demonstrates this package with shared feedback. Install `Erasmus-CTM/ai-feedback`, then run `quarto render example.qmd`. No other integration extension is required. The example builds automatically on pushes and pull requests; download the `standalone-example` Actions artifact. Feedback defaults to copy mode, which needs no API key.

### Page and exercise feedback policies

Put teaching policy definitions in YAML files and activate them explicitly with
`project-policy`, `page-policy` or a cell's `#| feedback-policy: name`. A policy
file registers definitions; `page-policy-files` alone does not change page
behavior. The same named policy can be reused across integrations.

YAML `ai-feedback.exercises.<integration>.<label>` targets one authored label;
an explicit named selection takes precedence over that entry. Omitted settings
inherit; `steps` replaces the entire list. See the
[shared policy guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/feedback-policies.md).
