(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  // Poll until mainPyodide is available.
  // The pyodide extension sets globalThis.mainPyodide when loading is complete.
  // Monaco is loaded lazily inside each cell via require(['vs/editor/editor.main'], ...)
  // so we do not need to wait for a window.monaco global here.
  function waitForReady(callback) {
    if (typeof mainPyodide !== 'undefined') {
      callback();
    } else {
      setTimeout(function () { waitForReady(callback); }, 300);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // Python: AST-based violation checker
  // ---------------------------------------------------------------------------
  // Runs before the student code is executed.
  // Reads _exercise_forbidden_imports and _exercise_forbidden_keywords from
  // Pyodide globals (set by JS as Python lists before each check).
  // Returns a JSON array of violation message strings (empty = no violations).
  //
  // Checked constructs:
  //   forbidden-imports  → ast.Import / ast.ImportFrom nodes
  //   forbidden-keywords → ast.Call (function / method names)
  //                        + statement-level keywords mapped to AST node types:
  //                          for, while, with, lambda, class, global, nonlocal,
  //                          try, raise, del, assert, yield
  var CHECKER_PY = [
    'import ast as _ast, json as _json',
    '',
    '_fi = list(_exercise_forbidden_imports)',
    '_fk = list(_exercise_forbidden_keywords)',
    '',
    '# Map keyword names to their AST node type(s)',
    '_KW_NODES = {',
    '    "for":      _ast.For,',
    '    "while":    _ast.While,',
    '    "with":     _ast.With,',
    '    "lambda":   _ast.Lambda,',
    '    "class":    _ast.ClassDef,',
    '    "global":   _ast.Global,',
    '    "nonlocal": _ast.Nonlocal,',
    '    "try":      _ast.Try,',
    '    "raise":    _ast.Raise,',
    '    "del":      _ast.Delete,',
    '    "assert":   _ast.Assert,',
    '    "yield":    _ast.Yield,',
    '}',
    '',
    '_violations = []',
    '_seen = set()',
    '',
    'def _add(msg):',
    '    if msg not in _seen:',
    '        _seen.add(msg)',
    '        _violations.append(msg)',
    '',
    'try:',
    '    _tree = _ast.parse(_exercise_student_code)',
    '    for _node in _ast.walk(_tree):',
    '',
    '        # --- Forbidden imports ---',
    '        if isinstance(_node, _ast.Import):',
    '            for _a in _node.names:',
    '                _top = _a.name.split(".")[0]',
    '                if _top in _fi:',
    '                    _add(f"Verbotener Import: \'{_top}\'")',
    '',
    '        elif isinstance(_node, _ast.ImportFrom):',
    '            if _node.module:',
    '                _top = _node.module.split(".")[0]',
    '                if _top in _fi:',
    '                    _add(f"Verbotener Import: \'{_top}\'")',
    '',
    '        # --- Forbidden function / method calls ---',
    '        elif isinstance(_node, _ast.Call):',
    '            if isinstance(_node.func, _ast.Name):',
    '                if _node.func.id in _fk:',
    '                    _add(f"Verbotene Funktion: \'{_node.func.id}\'")',
    '            elif isinstance(_node.func, _ast.Attribute):',
    '                if _node.func.attr in _fk:',
    '                    _add(f"Verbotene Methode: \'.{_node.func.attr}\'")',
    '',
    '        # --- Forbidden statement-level keywords ---',
    '        else:',
    '            for _kw, _nt in _KW_NODES.items():',
    '                if _kw in _fk and isinstance(_node, _nt):',
    '                    _add(f"Verbotenes Schlüsselwort: \'{_kw}\'")',
    '',
    'except SyntaxError:',
    '    pass  # syntax errors are reported by the main runner',
    '',
    '_json.dumps(_violations)',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Python: main runner
  // ---------------------------------------------------------------------------
  // Executes student code in an isolated namespace, captures stdout,
  // then runs each test statement individually for per-test feedback.
  // Reads _exercise_student_code and _exercise_test_code from Pyodide globals.
  var RUNNER_PY = [
    'import ast, json, io, sys, traceback',
    '',
    '_ns = {}',
    '_results = {"student_error": None, "stdout": "", "tests": []}',
    '',
    '# Run student code and capture its stdout',
    '_buf = io.StringIO()',
    '_old_stdout = sys.stdout',
    'sys.stdout = _buf',
    'try:',
    '    exec(compile(_exercise_student_code, "<student>", "exec"), _ns)',
    '    _results["stdout"] = _buf.getvalue()',
    'except Exception:',
    '    _results["student_error"] = traceback.format_exc()',
    '    _results["stdout"] = _buf.getvalue()',
    'finally:',
    '    sys.stdout = _old_stdout',
    '',
    '# Run each test statement individually for per-test feedback',
    'if _results["student_error"] is None:',
    '    try:',
    '        _tree = ast.parse(_exercise_test_code)',
    '        for _stmt in _tree.body:',
    '            _single = compile(',
    '                ast.Module(body=[_stmt], type_ignores=[]),',
    '                "<test>", "exec"',
    '            )',
    '            try:',
    '                exec(_single, _ns)',
    '                _results["tests"].append({"passed": True})',
    '            except AssertionError as e:',
    '                _results["tests"].append({',
    '                    "passed": False,',
    '                    "message": str(e) if str(e) else "Assertion fehlgeschlagen"',
    '                })',
    '            except Exception as e:',
    '                _results["tests"].append({"passed": False, "message": f"Fehler: {e}"})',
    '    except SyntaxError as e:',
    '        _results["student_error"] = f"Syntaxfehler in Tests: {e}"',
    '',
    'json.dumps(_results)',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Result rendering
  // ---------------------------------------------------------------------------

  function renderViolations(area, violations) {
    var items = violations.map(function (v) {
      return '<li>' + escapeHtml(v) + '</li>';
    }).join('');
    area.innerHTML =
      '<div class="py-exercise-violations">' +
      '<strong>🚫 Nicht erlaubt:</strong>' +
      '<ul class="py-exercise-violation-list">' + items + '</ul>' +
      '</div>';
  }

  function renderResult(area, data) {
    var html = '';

    if (data.student_error) {
      area.innerHTML =
        '<div class="py-exercise-error">' +
        '<strong>❌ Fehler im Code:</strong>' +
        '<pre>' + escapeHtml(data.student_error) + '</pre>' +
        '</div>';
      return;
    }

    if (data.stdout && data.stdout.trim()) {
      html +=
        '<div class="py-exercise-stdout">' +
        '<span class="py-exercise-stdout-label">Ausgabe:</span>' +
        '<pre>' + escapeHtml(data.stdout) + '</pre>' +
        '</div>';
    }

    var tests   = data.tests || [];
    var passed  = tests.filter(function (t) { return t.passed; }).length;
    var total   = tests.length;
    var allPass = total > 0 && passed === total;

    html += '<div class="py-exercise-summary">';

    if (allPass) {
      html +=
        '<div class="py-exercise-all-passed">✅ Alle ' + total +
        ' Test' + (total === 1 ? '' : 's') + ' bestanden!</div>';
    } else {
      html +=
        '<div class="py-exercise-some-failed">❌ ' + passed + ' von ' + total +
        ' Test' + (total === 1 ? '' : 's') + ' bestanden</div>';
    }

    if (total > 1) {
      html += '<ul class="py-exercise-test-list">';
      tests.forEach(function (t, i) {
        if (t.passed) {
          html += '<li class="py-test-pass">✓ Test ' + (i + 1) + '</li>';
        } else {
          html +=
            '<li class="py-test-fail">✗ Test ' + (i + 1) +
            (t.message ? ': ' + escapeHtml(t.message) : '') +
            '</li>';
        }
      });
      html += '</ul>';
    } else if (!allPass && tests[0] && tests[0].message) {
      html += '<div class="py-exercise-hint">' + escapeHtml(tests[0].message) + '</div>';
    }

    html += '</div>';
    area.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Exercise cell setup
  // ---------------------------------------------------------------------------

  function setupExercise(exerciseData) {
    var container = document.getElementById('py-exercise-' + exerciseData.id);
    if (!container) return;

    container.innerHTML = '';

    var starterCode       = exerciseData.starter          || '';
    var testsCode         = exerciseData.tests            || '';
    var forbiddenImports  = exerciseData.forbiddenImports  || [];
    var forbiddenKeywords = exerciseData.forbiddenKeywords || [];

    // Monaco editor container
    var editorContainer = document.createElement('div');
    editorContainer.className = 'py-exercise-editor';
    container.appendChild(editorContainer);

    // Button bar
    var buttonBar = document.createElement('div');
    buttonBar.className = 'py-exercise-buttons';

    var checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-primary py-exercise-check';
    checkBtn.innerHTML = '<i class="fa-solid fa-check"></i> Überprüfen';
    checkBtn.type = 'button';
    checkBtn.title = 'Code prüfen (Shift+Enter)';

    var resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-light py-exercise-reset';
    resetBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Zurücksetzen';
    resetBtn.type = 'button';
    resetBtn.title = 'Starter-Code wiederherstellen';

    buttonBar.appendChild(checkBtn);
    buttonBar.appendChild(resetBtn);
    container.appendChild(buttonBar);

    // Result area
    var resultArea = document.createElement('div');
    resultArea.className = 'py-exercise-result';
    container.appendChild(resultArea);

    // Monaco editor
    var editor;
    require(['vs/editor/editor.main'], function () {
      editor = monaco.editor.create(editorContainer, {
        value: starterCode,
        language: 'python',
        theme: 'vs-light',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        minimap: { enabled: false },
        fontSize: 14,
        renderLineHighlight: 'none',
        hideCursorInOverviewRuler: true,
      });

      var updateHeight = function () {
        var h = Math.max(80, editor.getContentHeight());
        editorContainer.style.height = h + 'px';
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();

      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, runCheck);
    });

    // -------------------------------------------------------------------------
    // Run the check
    // -------------------------------------------------------------------------
    async function runCheck() {
      if (!editor) return;

      resultArea.innerHTML = '<div class="py-exercise-running">⏳ Überprüfe…</div>';
      checkBtn.disabled = true;
      resetBtn.disabled = true;

      var studentCode = editor.getValue();

      try {
        // Pass all inputs to Python via globals – no string escaping needed
        mainPyodide.globals.set('_exercise_student_code',  studentCode);
        mainPyodide.globals.set('_exercise_test_code',     testsCode);
        mainPyodide.globals.set('_exercise_forbidden_imports',  mainPyodide.toPy(forbiddenImports));
        mainPyodide.globals.set('_exercise_forbidden_keywords', mainPyodide.toPy(forbiddenKeywords));

        // --- Step 1: check for forbidden constructs (AST only, no execution) ---
        if (forbiddenImports.length > 0 || forbiddenKeywords.length > 0) {
          var violationsRaw = await mainPyodide.runPythonAsync(CHECKER_PY);
          var violations = JSON.parse(violationsRaw);
          if (violations.length > 0) {
            renderViolations(resultArea, violations);
            return;
          }
        }

        // --- Step 2: auto-load packages, execute student code, run tests ---
        await mainPyodide.loadPackagesFromImports(studentCode);
        var raw  = await mainPyodide.runPythonAsync(RUNNER_PY);
        var data = JSON.parse(raw);
        renderResult(resultArea, data);

      } catch (err) {
        resultArea.innerHTML =
          '<div class="py-exercise-error">' +
          '<strong>❌ Unerwarteter Fehler:</strong>' +
          '<pre>' + escapeHtml(String(err)) + '</pre>' +
          '</div>';
      } finally {
        checkBtn.disabled = false;
        resetBtn.disabled = false;
      }
    }

    checkBtn.onclick = runCheck;
    resetBtn.onclick = function () {
      if (editor) editor.setValue(starterCode);
      resultArea.innerHTML = '';
    };
  }

  // ---------------------------------------------------------------------------
  // Init: wait for Pyodide, then build all registered exercises
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    waitForReady(function () {
      var exercises = window.__pyExercises || [];
      exercises.forEach(setupExercise);
    });
  });

})();
