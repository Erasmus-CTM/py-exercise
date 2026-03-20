# py-exercise

A Quarto extension for embedding interactive Python exercises with hidden unit tests.
Students write code in a Monaco editor directly in the browser; clicking **Check**
(or pressing **Shift+Enter**) runs their solution against predefined tests and shows
per-test pass/fail feedback – all without a server.

Built on top of the [coatless-quarto/pyodide](https://github.com/coatless-quarto/pyodide)
extension, which provides the Pyodide WebAssembly runtime and Monaco editor.

---

## Requirements

- [Quarto](https://quarto.org) ≥ 1.4.549
- The `coatless-quarto/pyodide` extension (must be installed alongside this one)

---

## Installation

Copy the `_extensions/py-exercise/` directory into your Quarto project so that the
structure looks like this:

```
your-project/
  _extensions/
    coatless-quarto/
      pyodide/          ← existing pyodide extension
    py-exercise/        ← this extension
      _extension.yml
      py-exercise.lua
      py-exercise.js
      py-exercise.css
  index.qmd
  _quarto.yml
```

---

## Usage

### 1. Activate both filters

> **Important:** The `coatless-quarto/pyodide` extension only injects the Pyodide
> runtime and Monaco editor when it finds at least one `{pyodide-python}` block in the
> document. If your document contains only `{py-exercise}` blocks and no regular
> `{pyodide-python}` blocks, add a hidden setup cell near the top of the document:
>
> ````markdown
> ```{pyodide-python}
> #| context: setup
> # Initialises Pyodide and Monaco – required for py-exercise cells.
> ```
> ````

In each document that contains exercises, declare both extensions in the YAML
front matter. **Order matters:** `coatless-quarto/pyodide` must come first so that
the Pyodide runtime and Monaco editor are loaded before `py-exercise` attaches to them.

```yaml
---
title: "My Exercises"
filters:
  - coatless-quarto/pyodide
  - py-exercise
---
```

Alternatively, activate them for an entire project in `_quarto.yml`:

```yaml
format:
  html:
    filters:
      - coatless-quarto/pyodide
      - py-exercise
```

### 2. Write exercises

Use the `{py-exercise}` code block class. Put the **starter code** (what the student
sees in the editor) above the sentinel line `## TESTS ##`, and the **test assertions**
below it. The test code is never shown to students.

````markdown
**Task:** Write a function `add(a, b)` that returns the sum of two numbers.

```{py-exercise}
def add(a, b):
    # Your solution here
    pass
## TESTS ##
assert add(1, 2) == 3,   "add(1, 2) should return 3"
assert add(-1, 1) == 0,  "add(-1, 1) should return 0"
assert add(0, 0) == 0,   "add(0, 0) should return 0"
```
````

### 3. Cell options

Options are set with `#|` comments at the top of the code block:

| Per-cell option       | Default         | Description                                            |
|-----------------------|-----------------|--------------------------------------------------------|
| `label`               | `py-exercise-N` | Unique identifier for the exercise cell                |
| `caption`             | *(none)*        | Short title shown above the editor                     |
| `forbidden-imports`   | *(none)*        | Comma-separated list of forbidden module names         |
| `forbidden-keywords`  | *(none)*        | Comma-separated list of forbidden functions / keywords |
| `show-test-hints`     | `true`          | Set to `false` to hide assertion messages on failed tests |

The following options are set in the document YAML front matter under the `py-exercise`
key and apply globally to every exercise in the document:

| Global option         | Default         | Description                                            |
|-----------------------|-----------------|--------------------------------------------------------|
| `lang`                | `en`            | UI language. Supported values: `en`, `de`              |
| `forbidden-imports`   | *(none)*        | Forbidden imports for every exercise                   |
| `forbidden-keywords`  | *(none)*        | Forbidden keywords for every exercise                  |
| `show-test-hints`     | `true`          | Default hint visibility for every exercise             |
| `submission`          | `false`         | Enable submission export mode                          |
| `submission-key`      | `py-exercise`   | Key used for XOR encoding of submissions               |

Per-cell `forbidden-imports` and `forbidden-keywords` entries are **merged** with the
global lists, not replacing them.

````markdown
```{py-exercise}
#| label: task-fibonacci
#| caption: Task – Fibonacci
def fib(n):
    pass
## TESTS ##
assert fib(0) == 0
assert fib(1) == 1
assert fib(6) == 8
```
````

---

### 4. Restricting allowed constructs

You can prevent students from using certain imports, built-in functions, methods, or
language keywords. Violations are detected **before** the code is executed (AST-only
analysis) and shown as a yellow warning box – the code is not run at all.

#### Global restrictions (apply to every exercise in the document)

```yaml
---
title: "My Exercises"
filters:
  - coatless-quarto/pyodide
  - py-exercise
py-exercise:
  forbidden-imports:
    - os
    - sys
    - subprocess
  forbidden-keywords:
    - eval
    - exec
---
```

#### Per-exercise restrictions (extend the global lists)

````markdown
```{py-exercise}
#| forbidden-imports: numpy, pandas
#| forbidden-keywords: sum, sorted, for
def my_sum(lst):
    pass
## TESTS ##
assert my_sum([1, 2, 3]) == 6
```
````

#### What is checked

The checker uses Python's `ast` module to inspect the student's code without running it:

| Entry in `forbidden-keywords`                        | What is blocked                          |
|------------------------------------------------------|------------------------------------------|
| A built-in or function name, e.g. `sorted`, `eval`   | Any call `sorted(...)` or `eval(...)`    |
| A method name, e.g. `sort`, `append`                 | Any method call `.sort()`, `.append()`   |
| `for`                                                | `for` loops (`ast.For`)                  |
| `while`                                              | `while` loops (`ast.While`)              |
| `lambda`                                             | Lambda expressions                       |
| `class`                                              | Class definitions                        |
| `with`                                               | Context managers                         |
| `try`                                                | try/except blocks                        |
| `raise`                                              | `raise` statements                       |
| `global` / `nonlocal`                                | Global/nonlocal declarations             |
| `yield`                                              | Generator expressions                    |

`forbidden-imports` blocks both `import os` and `from os import ...` style imports,
matching on the top-level module name.

---

### 5. Hiding test hints

By default, when a test fails its assertion message is shown to the student. Setting
`show-test-hints: false` suppresses the messages so students cannot infer what is being
tested from the failure output.

```yaml
# Global (all exercises):
py-exercise:
  show-test-hints: false
```

````markdown
# Per-cell:
```{py-exercise}
#| show-test-hints: false
def is_palindrome(s):
    pass
## TESTS ##
assert is_palindrome("racecar") == True
assert is_palindrome("hello")   == False
```
````

---

### 6. Submission export (optional)

When enabled, the page gains two input fields (Student ID, Quiz ID) above the first
exercise and an **Export results** button below the last exercise. Clicking the button
produces an encoded string that the student copies and submits.

#### Activating submission mode

```yaml
---
py-exercise:
  submission: true
  submission-key: "my-secret-key-2026"   # choose any string; defaults to "py-exercise"
---
```

The encoded string contains:

```json
{
  "v": 1,
  "sid": "<Student-ID>",
  "qid": "<Quiz-ID>",
  "ts":  "<ISO timestamp>",
  "results": [
    { "label": "task-add",  "passed": 3, "total": 4, "tests": [true, true, true, false] },
    { "label": "task-sort", "passed": 2, "total": 2, "tests": [true, true] }
  ]
}
```

#### Encoding scheme

`JSON → UTF-8 bytes → XOR with cycling key → Base64`

The scheme is reversible but not immediately obvious. Anyone viewing the page source can
read the key, so this is intended for discouraging casual tampering, not for
cryptographic security. Do not use for high-stakes assessments.

#### Decoding submissions (instructor script)

Use the included `decode.py` script to decode a submission string on the command line.
It will prompt you for the quiz key and the encoded submission string, then print the
decoded JSON.

```sh
python decode.py
```

---

### 7. JSON download

A **Download as JSON** button is always shown below the last exercise (inside the
submission footer when submission mode is active, otherwise in a separate footer).
Clicking it saves the current editor content and test results of all exercises to a
local `.json` file for personal documentation — no server is involved.

---

### 8. Persistent code

Editor contents are automatically saved to `localStorage` as the student types
(debounced, 500 ms). On reload, each exercise restores the last saved code instead of
the original starter code. The **Reset** button clears the saved value and restores the
starter code.

Storage keys are scoped to the page path and the exercise label, so exercises on
different pages do not interfere with each other.

---

## How it works

### Lua filter (`py-exercise.lua`)

The filter runs in two phases:

1. **`Meta` phase** – reads all global options from the document front matter
   (`lang`, `forbidden-imports`, `forbidden-keywords`, `show-test-hints`,
   `submission`, `submission-key`).
2. **`CodeBlock` phase** – for each `{py-exercise}` block:
   - Parses `#|` options and strips them from the code.
   - Splits the remaining code on the `## TESTS ##` sentinel into `starter` and `tests`.
   - Merges global and per-cell forbidden lists (deduplicating).
   - Replaces the block with a `<div id="py-exercise-N">` placeholder plus an inline
     `<script>` that registers all exercise data (JSON-encoded) in `window.__pyExercises`.
   - Injects the extension's CSS and JS into the page exactly once.

### JavaScript (`py-exercise.js`)

On `DOMContentLoaded`, the script polls until `mainPyodide` is available, then
initialises every exercise cell: creates a Monaco editor, restores any saved code from
`localStorage`, and wires up the buttons.

When **Check** is clicked (or Shift+Enter is pressed):

1. All inputs are passed to Python via `mainPyodide.globals.set()` – no string escaping.
2. **If** forbidden lists are non-empty, an AST-only checker runs first. Any violations
   are displayed immediately and execution is aborted.
3. Otherwise, student packages are auto-loaded, the student code is executed in an
   isolated namespace (stdout captured), and each test `assert` is run individually.
4. Results are rendered with per-test pass/fail feedback.

### Python checker (AST only, no execution)

```python
import ast, json

_tree = ast.parse(_exercise_student_code)
for _node in ast.walk(_tree):
    if isinstance(_node, ast.Import):          # import os
        ...
    elif isinstance(_node, ast.ImportFrom):    # from os import path
        ...
    elif isinstance(_node, ast.Call):          # sorted(...) or lst.sort()
        ...
    else:                                      # for / while / lambda / ...
        ...

json.dumps(_violations)   # list of human-readable violation strings
```

### Python runner

```python
import ast, json, io, sys, traceback

_ns = {}
_buf = io.StringIO()
sys.stdout = _buf
try:
    exec(compile(_exercise_student_code, "<student>", "exec"), _ns)
except Exception:
    _results["student_error"] = traceback.format_exc()
finally:
    sys.stdout = _old_stdout

# each assert statement is compiled and run individually:
for _stmt in ast.parse(_exercise_test_code).body:
    try:
        exec(compile(ast.Module(body=[_stmt], ...), "<test>", "exec"), _ns)
        _results["tests"].append({"passed": True})
    except AssertionError as e:
        _results["tests"].append({"passed": False, "message": str(e)})

json.dumps(_results)
```

---

## Writing good tests

- Use plain `assert` statements. Each statement is one test and is reported individually.
- Always provide an assertion message – it is shown to the student when a test fails
  (unless `show-test-hints: false`).
- Keep assertion messages student-friendly: describe what the function *should* return,
  not what the test *checks*.
- Use private variable names (leading `_`) for any helper variables in the test section
  so they do not pollute the student's namespace in an unexpected way.

```python
## TESTS ##
assert my_func(1) == 42, "my_func(1) should return 42"

# Helper variables with _ prefix
_lst = [1, 2, 3]
_copy = my_func(_lst)
assert _lst == [1, 2, 3], "my_func should not modify the input list"
```

---

## Localization

Set the UI language in the document front matter:

```yaml
py-exercise:
  lang: en   # default
  # lang: de
```

Supported languages: `en` (English), `de` (German).

To add a new language, open `py-exercise.js` and add a new entry to the `LOCALES`
object, copying the structure of the `en` entry. The keys cover all UI strings,
including the Python violation/error message templates (which use `{}` as the
`str.format()` placeholder). Then add the corresponding noscript message to the
`noscriptMessages` table in `py-exercise.lua`.

---

## Limitations

- The test code is hidden in the rendered HTML but is present in the page source.
  This is appropriate for educational use but not for high-stakes assessments.
- Exercises share the same Pyodide Python session as other cells on the page.
  Functions defined in one exercise are visible in subsequent exercises during a
  single browser session.
- Heavy packages (numpy, pandas, …) are loaded on first import and may add a few
  seconds on the first run. Subsequent runs are fast.
- `localStorage` persistence relies on the browser's storage quota and is not
  available in all private-browsing modes.

---

## Authors

- Michael Kallweit

---

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0)
