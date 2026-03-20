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
  // Python runner
  // ---------------------------------------------------------------------------
  // We build the runner as an array of strings to keep the source readable.
  // Pyodide globals (_exercise_student_code, _exercise_test_code) are set by JS
  // before each run – this avoids any string-escaping issues.
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

  function renderResult(area, data) {
    var html = '';

    // Student code had a runtime / syntax error
    if (data.student_error) {
      area.innerHTML =
        '<div class="py-exercise-error">' +
        '<strong>❌ Fehler im Code:</strong>' +
        '<pre>' + escapeHtml(data.student_error) + '</pre>' +
        '</div>';
      return;
    }

    // Captured stdout from student code
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

    // Show individual results when there is more than one test
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
      // Single test: show the assertion message as a hint
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

    // Replace noscript placeholder
    container.innerHTML = '';

    var starterCode = exerciseData.starter || '';
    var testsCode   = exerciseData.tests   || '';

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

    // Monaco editor (loaded via RequireJS, same as the pyodide extension uses)
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

      // Auto-resize editor to content height
      var updateHeight = function () {
        var h = Math.max(80, editor.getContentHeight());
        editorContainer.style.height = h + 'px';
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();

      // Shift+Enter triggers the check (consistent with pyodide cells)
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
        // Pass code into Python globals – no string escaping needed
        mainPyodide.globals.set('_exercise_student_code', studentCode);
        mainPyodide.globals.set('_exercise_test_code', testsCode);

        // Auto-load any packages the student imports
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
  // Init: wait for Pyodide + Monaco, then build all registered exercises
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    waitForReady(function () {
      var exercises = window.__pyExercises || [];
      exercises.forEach(setupExercise);
    });
  });

})();
