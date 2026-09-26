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
| `caption` | String | — | Title shown above the exercise |
| `forbidden-imports` | comma-separated | — | Forbidden `import` statements |
| `forbidden-keywords` | comma-separated | — | Forbidden Python keywords |
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
- Forbidding `for`/`while` → the solution must use a list comprehension or `map`
- Forbidding `sorted` → a custom sorting algorithm is required
- Forbidding `os`, `sys`, `subprocess` → safety in learning environments

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

The encoded string can be decoded by the instructor with:

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

After running, each test shows:

- ✅ **Passed** – test succeeded
- ❌ **Failed** – with the assertion message (if `show-test-hints: true`)

The assertion message is the text after the comma in `assert ..., "message"`.
If `show-test-hints: false` is set, students only see whether a test failed,
without a hint as to why.

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

```{py-exercise}
#| label: fibonacci
#| caption: Fibonacci sequence
#| forbidden-keywords: for, while
Implement a recursive function `fib(n)` that returns the n-th
Fibonacci number (fib(0) = 0, fib(1) = 1).

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
| Pyodide 0.27+ (CDN) | Loaded automatically |
| Monaco Editor 0.46+ (CDN) | Loaded automatically |

---

## Shared feedback integration branch

This branch supports the shared `ai-feedback` extension. Install both extensions,
list `ai-feedback` before `py-exercise` in the Quarto filters, and enable:

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

The integration is developed and tested in Erasmus-CTM/ctm-assessment before a
consumer pull request is opened.

## Configurable shared teaching policies

With ai-feedback 0.4.0, use `ai-feedback.policy-files` in Quarto metadata to
load one YAML file or an ordered list. Each file defines `ai-feedback.defaults`
and/or `ai-feedback.integrations` with this integration’s name. Configure `prompt`,
`steps`, `language`, `max-words`, `max-issues`, `allow-full-solution` and
`reset-on-run`. Later step lists replace earlier lists; `steps: []` selects review
mode. Run/Check resets progression by default; set `reset-on-run: false` to keep it.
Explicit Reset always restarts at step one.

See the [shared policy guide](https://github.com/Erasmus-CTM/ai-feedback/blob/main/docs/feedback-policies.md).

## Shared dependency and learning context

Install ai-feedback once in the project; `py-exercise: feedback: true` loads it
automatically. This branch requires the ai-feedback integration preview 0.6.0.
No shared runtime is copied into this plugin. Omitted `context` collects preceding
section prose; `context: none` opts out; `context: id1,id2` selects tagged
`.ai-context` blocks reusable by text, math and Pyodide activities.
`feedback-context` is an alias. See the
[shared guide](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/scoped-policies/README.md)
for policies, limits, evidence boundaries and settings.

### Standalone example

`example.qmd` demonstrates this package with shared feedback. Install `Erasmus-CTM/ai-feedback@feature/scoped-policies`, then run `quarto render example.qmd`. No other integration extension is required. The example builds automatically on pushes and pull requests; download the `standalone-example` Actions artifact. Feedback defaults to copy mode, which needs no API key.

### Page and exercise feedback policies

With ai-feedback 0.6.0, put all new teaching policy definitions in YAML files.
Project `ai-feedback.policy-files` loads common policies; page front matter can
load `ai-feedback.page-policy-files`. Both accept one path or an ordered list,
relative to the project root. Page settings override project settings.

In a cell, `#| feedback-policy: short-hints` selects an existing entry from the
YAML file's `ai-feedback.policies` mapping. Inline prompt/step mappings are not
accepted. The same named policy can be reused in every integration. YAML
`ai-feedback.exercises.<integration>.<label>` targets a specific authored label;
an explicit named selection takes precedence over that entry. Omitted settings
inherit; `steps` replaces the entire list and `steps: []` disables progression.
See [the shared policy guide](https://github.com/Erasmus-CTM/ai-feedback/blob/feature/scoped-policies/docs/feedback-policies.md).
During preview, install `Erasmus-CTM/ai-feedback@feature/scoped-policies`.

The [standalone example — download and open in your editor](https://github.com/Erasmus-CTM/py-exercise/blob/feature/shared-feedback-integration/example.qmd) and
[feature overview — download and open in your editor](https://github.com/Erasmus-CTM/py-exercise/blob/feature/shared-feedback-integration/example-en.qmd) include two policy
comparisons: progressive debugging hints versus a worked correction, and
correctness review versus readability review of passing code. Each pair keeps
its task, starter and tests identical. Policies are defined in
[feedback/python-policies.yml](../feedback/python-policies.yml); collapsed panels
show the exercise source and YAML. Download the `standalone-example` GitHub
Actions artifact to try the rendered pages.
