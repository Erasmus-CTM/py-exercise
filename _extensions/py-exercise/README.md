# py-exercise

A Quarto extension for embedding interactive Python exercises with hidden unit tests.
Students write code in a Monaco editor directly in the browser; clicking **Überprüfen**
runs their solution against predefined tests and shows per-test pass/fail feedback –
all without a server.

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
**Aufgabe:** Schreibe eine Funktion `add(a, b)`, die zwei Zahlen addiert.

```{py-exercise}
def add(a, b):
    # Deine Lösung hier
    pass
## TESTS ##
assert add(1, 2) == 3,   "add(1, 2) sollte 3 ergeben"
assert add(-1, 1) == 0,  "add(-1, 1) sollte 0 ergeben"
assert add(0, 0) == 0,   "add(0, 0) sollte 0 ergeben"
```
````

### 3. Cell options

Options are set with `#|` comments at the top of the code block:

| Option    | Default            | Description                              |
|-----------|--------------------|------------------------------------------|
| `label`   | `py-exercise-N`    | Unique identifier for the exercise cell  |
| `caption` | *(none)*           | Short title shown above the editor       |

```
```{py-exercise}
#| label: task-fibonacci
#| caption: Aufgabe – Fibonacci
def fib(n):
    pass
## TESTS ##
assert fib(0) == 0
assert fib(1) == 1
assert fib(6) == 8
```
```

---

## How it works

### Lua filter (`py-exercise.lua`)

The filter processes `{py-exercise}` code blocks at render time:

1. Parses `#|` options and strips them from the code.
2. Splits the remaining code on the `## TESTS ##` sentinel into `starter` and `tests`.
3. Replaces the code block with a `<div id="py-exercise-N">` placeholder.
4. Emits an inline `<script>` that registers the exercise data
   (JSON-encoded via `quarto.json.encode`) into `window.__pyExercises`.
5. Injects the extension's CSS and JS into the page exactly once.

### JavaScript (`py-exercise.js`)

On `DOMContentLoaded`, the script polls until both `mainPyodide` (set by the pyodide
extension) and `monaco` are available, then initialises every exercise cell:

1. Creates a Monaco editor pre-filled with the starter code.
2. Adds **Überprüfen** and **Zurücksetzen** buttons.

When **Überprüfen** is clicked (or Shift+Enter is pressed inside the editor):

1. The student's code is passed to Python via `mainPyodide.globals.set()` –
   no string escaping needed.
2. The student's code is executed in an isolated namespace; `print()` output is captured.
3. Each `assert` statement in the test code is parsed individually with Python's `ast`
   module and executed, yielding per-test pass/fail results.
4. Results are rendered: a green summary if all tests pass, or a red summary with
   the failing assertion messages if any test fails.

### Python runner (embedded in JS)

```python
import ast, json, io, sys, traceback

_ns = {}
_results = {"student_error": None, "stdout": "", "tests": []}

_buf = io.StringIO()
sys.stdout = _buf
try:
    exec(compile(_exercise_student_code, "<student>", "exec"), _ns)
    _results["stdout"] = _buf.getvalue()
except Exception:
    _results["student_error"] = traceback.format_exc()
    _results["stdout"] = _buf.getvalue()
finally:
    sys.stdout = _old_stdout

if _results["student_error"] is None:
    _tree = ast.parse(_exercise_test_code)
    for _stmt in _tree.body:
        _single = compile(ast.Module(body=[_stmt], type_ignores=[]), "<test>", "exec")
        try:
            exec(_single, _ns)
            _results["tests"].append({"passed": True})
        except AssertionError as e:
            _results["tests"].append({"passed": False, "message": str(e)})

json.dumps(_results)
```

---

## Writing good tests

- Use plain `assert` statements. Each statement is one test and is reported individually.
- Always provide an assertion message – it is shown to the student when a test fails.
- Keep assertion messages student-friendly: describe what the function *should* return,
  not what the test *checks*.
- Use private variable names (leading `_`) for any helper variables in the test section
  so they do not pollute the student's namespace in an unexpected way.

```python
## TESTS ##
assert my_func(1) == 42, "my_func(1) sollte 42 zurückgeben"

# Helper variables with _ prefix
_lst = [1, 2, 3]
_copy = my_func(_lst)
assert _lst == [1, 2, 3], "Die Original-Liste darf nicht verändert werden"
```

---

## Limitations

- The test code is hidden in the rendered HTML but is present in the page source.
  This is appropriate for educational use but not for high-stakes assessments.
- Exercises share the same Pyodide Python session as other cells on the page.
  Functions defined in one exercise are visible in subsequent exercises during a
  single browser session.
- Heavy packages (numpy, pandas, …) are loaded on first import and may add a few
  seconds on the first run. Subsequent runs are fast.
