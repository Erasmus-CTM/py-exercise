# py-exercise – Quarto Extension

**Interactive Python coding exercises with hidden unit tests, running entirely in the browser** —
no server, no backend. Students edit starter code in a Monaco editor; hidden `assert` tests
run automatically on click via [Pyodide](https://pyodide.org) (Python in WebAssembly).
Supports forbidden-construct checks, optional submission export, and multilingual UI.

---

## Installation

```bash
quarto add Erasmus-CTM/Py-Exercise
```

---

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

With `submission: true`, a submission header appears with input fields for
**student ID** and **quiz ID**. After the tests pass successfully, the
student can download the result as a **JSON file**.

Results are XOR-encoded with the `submission-key` and Base64-encoded, so the
raw results cannot be read without the key.

```yaml
py-exercise:
  submission: true
  submission-key: "sose25-quiz1"
```

---

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

## Funding

Part of this work was funded by the Erasmus+ project “Computational Thinking
makes sense of Mathematics” (2023-1-NO01-KA220-HED-000166744).

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
