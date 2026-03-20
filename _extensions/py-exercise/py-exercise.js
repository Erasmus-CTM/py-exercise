(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

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
  // Submission state
  // ---------------------------------------------------------------------------

  // Filled in from window.__pyExerciseConfig (injected by Lua filter)
  var submissionConfig = (window.__pyExerciseConfig) || { submission: false, submissionKey: 'py-exercise' };

  // Map of exercise label → { label, passed, total, tests: [bool, ...] }
  // Updated after every successful check run.
  var exerciseResults = {};

  // Map of exercise label → Monaco editor instance.
  // Populated in setupExercise; used by downloadAll() to capture current code.
  var exerciseEditors = {};

  // ---------------------------------------------------------------------------
  // Python: AST-based violation checker
  // ---------------------------------------------------------------------------
  var CHECKER_PY = [
    'import ast as _ast, json as _json',
    '',
    '_fi = list(_exercise_forbidden_imports)',
    '_fk = list(_exercise_forbidden_keywords)',
    '',
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
    '        if isinstance(_node, _ast.Import):',
    '            for _a in _node.names:',
    '                _top = _a.name.split(".")[0]',
    '                if _top in _fi:',
    '                    _add(f"Verbotener Import: \'{_top}\'")',
    '        elif isinstance(_node, _ast.ImportFrom):',
    '            if _node.module:',
    '                _top = _node.module.split(".")[0]',
    '                if _top in _fi:',
    '                    _add(f"Verbotener Import: \'{_top}\'")',
    '        elif isinstance(_node, _ast.Call):',
    '            if isinstance(_node.func, _ast.Name):',
    '                if _node.func.id in _fk:',
    '                    _add(f"Verbotene Funktion: \'{_node.func.id}\'")',
    '            elif isinstance(_node.func, _ast.Attribute):',
    '                if _node.func.attr in _fk:',
    '                    _add(f"Verbotene Methode: \'.{_node.func.attr}\'")',
    '        else:',
    '            for _kw, _nt in _KW_NODES.items():',
    '                if _kw in _fk and isinstance(_node, _nt):',
    '                    _add(f"Verbotenes Schlüsselwort: \'{_kw}\'")',
    'except SyntaxError:',
    '    pass',
    '',
    '_json.dumps(_violations)',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Python: main runner
  // ---------------------------------------------------------------------------
  var RUNNER_PY = [
    'import ast, json, io, sys, traceback',
    '',
    '_ns = {}',
    '_results = {"student_error": None, "stdout": "", "tests": []}',
    '',
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
  // Python: submission encoder
  // ---------------------------------------------------------------------------
  // Encoding: JSON → UTF-8 bytes → XOR with cycling key → Base64.
  // Decoding requires knowing both the key and the procedure.
  var ENCODER_PY = [
    'import json as _json, base64 as _b64',
    '',
    '_key  = _submission_key.encode("utf-8")',
    '_raw  = _json.dumps(_submission_payload, ensure_ascii=False).encode("utf-8")',
    '_xord = bytes(b ^ _key[i % len(_key)] for i, b in enumerate(_raw))',
    '_b64.b64encode(_xord).decode("ascii")',
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

  function renderResult(area, data, label) {
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

    // Store result for submission export
    if (label && total > 0) {
      exerciseResults[label] = {
        label:  label,
        passed: passed,
        total:  total,
        tests:  tests.map(function (t) { return t.passed; }),
      };
    }

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

    var starterCode       = exerciseData.starter           || '';
    var testsCode         = exerciseData.tests             || '';
    var forbiddenImports  = exerciseData.forbiddenImports  || [];
    var forbiddenKeywords = exerciseData.forbiddenKeywords || [];
    var label             = exerciseData.label;

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

    var resultArea = document.createElement('div');
    resultArea.className = 'py-exercise-result';
    container.appendChild(resultArea);

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

      // Store reference so downloadAll() can read the current code later
      exerciseEditors[label] = editor;

      var updateHeight = function () {
        var h = Math.max(80, editor.getContentHeight());
        editorContainer.style.height = h + 'px';
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();

      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, runCheck);
    });

    async function runCheck() {
      if (!editor) return;

      resultArea.innerHTML = '<div class="py-exercise-running">⏳ Überprüfe…</div>';
      checkBtn.disabled = true;
      resetBtn.disabled = true;

      var studentCode = editor.getValue();

      try {
        mainPyodide.globals.set('_exercise_student_code',  studentCode);
        mainPyodide.globals.set('_exercise_test_code',     testsCode);
        mainPyodide.globals.set('_exercise_forbidden_imports',  mainPyodide.toPy(forbiddenImports));
        mainPyodide.globals.set('_exercise_forbidden_keywords', mainPyodide.toPy(forbiddenKeywords));

        if (forbiddenImports.length > 0 || forbiddenKeywords.length > 0) {
          var violationsRaw = await mainPyodide.runPythonAsync(CHECKER_PY);
          var violations = JSON.parse(violationsRaw);
          if (violations.length > 0) {
            renderViolations(resultArea, violations);
            return;
          }
        }

        await mainPyodide.loadPackagesFromImports(studentCode);
        var raw  = await mainPyodide.runPythonAsync(RUNNER_PY);
        var data = JSON.parse(raw);
        renderResult(resultArea, data, label);

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
  // Submission UI
  // ---------------------------------------------------------------------------

  function buildSubmissionHeader() {
    var wrap = document.createElement('div');
    wrap.className = 'py-submission-header';
    wrap.innerHTML =
      '<div class="py-submission-header-inner">' +
        '<h5 class="py-submission-title">📋 Abgabe</h5>' +
        '<div class="py-submission-fields">' +
          '<div class="py-submission-field">' +
            '<label for="py-submission-student-id">Student-ID</label>' +
            '<input type="text" id="py-submission-student-id" ' +
                   'placeholder="z.B. s123456" autocomplete="off">' +
          '</div>' +
          '<div class="py-submission-field">' +
            '<label for="py-submission-quiz-id">Quiz-ID</label>' +
            '<input type="text" id="py-submission-quiz-id" ' +
                   'placeholder="z.B. quiz-01" autocomplete="off">' +
          '</div>' +
        '</div>' +
      '</div>';
    return wrap;
  }

  function buildSubmissionFooter() {
    var wrap = document.createElement('div');
    wrap.className = 'py-submission-footer';

    var btn = document.createElement('button');
    btn.className = 'btn btn-success py-submission-export-btn';
    btn.innerHTML = '<i class="fa-solid fa-file-export"></i> Ergebnis exportieren';
    btn.type = 'button';
    btn.onclick = exportResults;

    var msg = document.createElement('div');
    msg.className = 'py-submission-msg';
    msg.id = 'py-submission-msg';

    var outWrap = document.createElement('div');
    outWrap.className = 'py-submission-output-wrap';
    outWrap.id = 'py-submission-output-wrap';
    outWrap.style.display = 'none';

    var outLabelRow = document.createElement('div');
    outLabelRow.className = 'py-submission-output-labelrow';

    var outLabel = document.createElement('span');
    outLabel.className = 'py-submission-output-label';
    outLabel.textContent = 'Kodierten String kopieren und abgeben:';

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-light btn-sm py-submission-copy-btn';
    copyBtn.id = 'py-submission-copy-btn';
    copyBtn.type = 'button';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Kopieren';
    copyBtn.onclick = function () {
      var text = (document.getElementById('py-submission-output') || {}).value || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Kopiert!';
        copyBtn.classList.add('py-submission-copy-ok');
        setTimeout(function () {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Kopieren';
          copyBtn.classList.remove('py-submission-copy-ok');
        }, 2000);
      });
    };

    outLabelRow.appendChild(outLabel);
    outLabelRow.appendChild(copyBtn);

    var textarea = document.createElement('textarea');
    textarea.className = 'py-submission-output';
    textarea.id = 'py-submission-output';
    textarea.readOnly = true;
    textarea.rows = 4;
    textarea.onclick = function () { this.select(); };

    outWrap.appendChild(outLabelRow);
    outWrap.appendChild(textarea);

    wrap.appendChild(btn);
    wrap.appendChild(msg);
    wrap.appendChild(outWrap);
    return wrap;
  }

  async function exportResults() {
    var studentId = (document.getElementById('py-submission-student-id') || {}).value;
    var quizId    = (document.getElementById('py-submission-quiz-id')    || {}).value;

    studentId = (studentId || '').trim();
    quizId    = (quizId    || '').trim();

    var msgEl     = document.getElementById('py-submission-msg');
    var outWrap   = document.getElementById('py-submission-output-wrap');
    var outArea   = document.getElementById('py-submission-output');

    if (!studentId || !quizId) {
      if (msgEl) {
        msgEl.innerHTML =
          '<div class="py-submission-error">Bitte Student-ID und Quiz-ID ausfüllen.</div>';
      }
      if (outWrap) outWrap.style.display = 'none';
      return;
    }
    if (msgEl) msgEl.innerHTML = '';

    // Collect results for every registered exercise (unattempted → 0/total)
    var allResults = (window.__pyExercises || []).map(function (ex) {
      return exerciseResults[ex.label] || {
        label:  ex.label,
        passed: 0,
        total:  0,        // 0 = not attempted
        tests:  [],
      };
    });

    var payload = {
      v:       1,
      sid:     studentId,
      qid:     quizId,
      ts:      new Date().toISOString(),
      results: allResults,
    };

    try {
      mainPyodide.globals.set('_submission_payload', mainPyodide.toPy(payload));
      mainPyodide.globals.set('_submission_key',     submissionConfig.submissionKey || 'py-exercise');

      var encoded = await mainPyodide.runPythonAsync(ENCODER_PY);

      if (outArea)  outArea.value = encoded;
      if (outWrap)  outWrap.style.display = '';
      if (msgEl)    msgEl.innerHTML = '';

    } catch (err) {
      if (msgEl) {
        msgEl.innerHTML =
          '<div class="py-submission-error">Fehler beim Kodieren: ' +
          escapeHtml(String(err)) + '</div>';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Download (personal documentation)
  // ---------------------------------------------------------------------------

  function downloadAll() {
    var exercises = (window.__pyExercises || []).map(function (ex) {
      var editor = exerciseEditors[ex.label];
      var result = exerciseResults[ex.label] || null;
      return {
        label:   ex.label,
        caption: ex.caption || null,
        code:    editor ? editor.getValue() : ex.starter,
        result:  result,
      };
    });

    var data = {
      exported_at: new Date().toISOString(),
      exercises:   exercises,
    };

    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'aufgaben-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildDownloadSection() {
    var wrap = document.createElement('div');
    wrap.className = 'py-download-section';

    var btn = document.createElement('button');
    btn.className = 'btn btn-outline-secondary py-download-btn';
    btn.innerHTML = '<i class="fa-solid fa-download"></i> Als JSON herunterladen';
    btn.type = 'button';
    btn.title = 'Aktuellen Code und Testergebnisse aller Aufgaben speichern';
    btn.onclick = downloadAll;

    var hint = document.createElement('span');
    hint.className = 'py-download-hint';
    hint.textContent = 'Speichert Code-Eingaben und Testergebnisse zur eigenen Dokumentation.';

    wrap.appendChild(btn);
    wrap.appendChild(hint);
    return wrap;
  }

  function initDownload() {
    var cells = document.querySelectorAll('.py-exercise-cell');
    if (cells.length === 0) return;

    // If a submission footer exists, append the download section to it (with separator).
    // Otherwise create a standalone footer after the last exercise cell.
    var subFooter = document.querySelector('.py-submission-footer');
    if (subFooter) {
      var sep = document.createElement('hr');
      sep.className = 'py-footer-sep';
      subFooter.appendChild(sep);
      subFooter.appendChild(buildDownloadSection());
    } else {
      var footer = document.createElement('div');
      footer.className = 'py-download-footer';
      footer.appendChild(buildDownloadSection());
      var lastCell = cells[cells.length - 1];
      lastCell.parentNode.insertBefore(footer, lastCell.nextSibling);
    }
  }

  function initSubmission() {
    if (!submissionConfig.submission) return;

    var cells = document.querySelectorAll('.py-exercise-cell');
    if (cells.length === 0) return;

    // Header before the first exercise cell
    var header = buildSubmissionHeader();
    cells[0].parentNode.insertBefore(header, cells[0]);

    // Footer after the last exercise cell
    var lastCell = cells[cells.length - 1];
    var footer = buildSubmissionFooter();
    lastCell.parentNode.insertBefore(footer, lastCell.nextSibling);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    waitForReady(function () {
      var exercises = window.__pyExercises || [];
      exercises.forEach(setupExercise);
      initSubmission();
      initDownload();
    });
  });

})();
