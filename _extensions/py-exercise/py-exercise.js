(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Locales – add new languages here
  // ---------------------------------------------------------------------------

  var LOCALES = {
    en: {
      btnCheck:             '<i class="fa-solid fa-check"></i> Check',
      btnCheckTitle:        'Run checks (Shift+Enter)',
      btnReset:             '<i class="fa-solid fa-arrows-rotate"></i> Reset',
      btnResetTitle:        'Restore starter code',
      running:              '⏳ Checking…',
      errorHeader:          '❌ Error in code:',
      unexpectedError:      '❌ Unexpected error:',
      stdoutLabel:          'Output:',
      allPassed: function (n) {
        return '✅ All ' + n + ' test' + (n === 1 ? '' : 's') + ' passed!';
      },
      someFailed: function (p, t) {
        return '❌ ' + p + ' of ' + t + ' test' + (t === 1 ? '' : 's') + ' passed';
      },
      violationsHeader:     '🚫 Not allowed:',
      // Submission UI
      submissionTitle:      '📋 Submission',
      studentIdLabel:       'Student ID',
      studentIdPlaceholder: 'e.g. s123456',
      quizIdLabel:          'Quiz ID',
      quizIdPlaceholder:    'e.g. quiz-01',
      exportBtn:            '<i class="fa-solid fa-file-export"></i> Export results',
      outputLabel:          'Copy encoded string and submit:',
      copyBtn:              '<i class="fa-regular fa-copy"></i> Copy',
      copyOk:               '<i class="fa-solid fa-check"></i> Copied!',
      validationError:      'Please fill in Student ID and Quiz ID.',
      encodingError:        'Error during encoding: ',
      // Download
      downloadBtn:          '<i class="fa-solid fa-download"></i> Download as JSON',
      downloadBtnTitle:     'Save current code and test results for all exercises',
      downloadHint:         'Saves your code and test results for personal documentation.',
      downloadFilename:     'exercises-',
      // Python message templates – use {} as placeholder for str.format()
      msgForbiddenImport:   "Forbidden import: '{}'",
      msgForbiddenFunction: "Forbidden function: '{}'",
      msgForbiddenMethod:   "Forbidden method: '.{}'",
      msgForbiddenKeyword:  "Forbidden keyword: '{}'",
      msgAssertionFailed:   'Assertion failed',
      msgTestError:         'Error: {}',
      msgSyntaxError:       'Syntax error in tests: {}',
    },
    de: {
      btnCheck:             '<i class="fa-solid fa-check"></i> Überprüfen',
      btnCheckTitle:        'Code prüfen (Shift+Enter)',
      btnReset:             '<i class="fa-solid fa-arrows-rotate"></i> Zurücksetzen',
      btnResetTitle:        'Starter-Code wiederherstellen',
      running:              '⏳ Überprüfe…',
      errorHeader:          '❌ Fehler im Code:',
      unexpectedError:      '❌ Unerwarteter Fehler:',
      stdoutLabel:          'Ausgabe:',
      allPassed: function (n) {
        return '✅ Alle ' + n + ' Test' + (n === 1 ? '' : 's') + ' bestanden!';
      },
      someFailed: function (p, t) {
        return '❌ ' + p + ' von ' + t + ' Test' + (t === 1 ? '' : 's') + ' bestanden';
      },
      violationsHeader:     '🚫 Nicht erlaubt:',
      // Submission UI
      submissionTitle:      '📋 Abgabe',
      studentIdLabel:       'Student-ID',
      studentIdPlaceholder: 'z.B. s123456',
      quizIdLabel:          'Quiz-ID',
      quizIdPlaceholder:    'z.B. quiz-01',
      exportBtn:            '<i class="fa-solid fa-file-export"></i> Ergebnis exportieren',
      outputLabel:          'Kodierten String kopieren und abgeben:',
      copyBtn:              '<i class="fa-regular fa-copy"></i> Kopieren',
      copyOk:               '<i class="fa-solid fa-check"></i> Kopiert!',
      validationError:      'Bitte Student-ID und Quiz-ID ausfüllen.',
      encodingError:        'Fehler beim Kodieren: ',
      // Download
      downloadBtn:          '<i class="fa-solid fa-download"></i> Als JSON herunterladen',
      downloadBtnTitle:     'Aktuellen Code und Testergebnisse aller Aufgaben speichern',
      downloadHint:         'Speichert Code-Eingaben und Testergebnisse zur eigenen Dokumentation.',
      downloadFilename:     'aufgaben-',
      // Python message templates
      msgForbiddenImport:   "Verbotener Import: '{}'",
      msgForbiddenFunction: "Verbotene Funktion: '{}'",
      msgForbiddenMethod:   "Verbotene Methode: '.{}'",
      msgForbiddenKeyword:  "Verbotenes Schlüsselwort: '{}'",
      msgAssertionFailed:   'Assertion fehlgeschlagen',
      msgTestError:         'Fehler: {}',
      msgSyntaxError:       'Syntaxfehler in Tests: {}',
    },
  };

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
  // Submission state + locale
  // ---------------------------------------------------------------------------

  var submissionConfig = (window.__pyExerciseConfig) || { submission: false, submissionKey: 'py-exercise', lang: 'en' };
  var L = LOCALES[submissionConfig.lang] || LOCALES['en'];

  // Map of exercise label → { label, passed, total, tests: [bool, ...] }
  var exerciseResults = {};

  // Map of exercise label → Monaco editor instance
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
    '                    _add(_msg_forbidden_import.format(_top))',
    '        elif isinstance(_node, _ast.ImportFrom):',
    '            if _node.module:',
    '                _top = _node.module.split(".")[0]',
    '                if _top in _fi:',
    '                    _add(_msg_forbidden_import.format(_top))',
    '        elif isinstance(_node, _ast.Call):',
    '            if isinstance(_node.func, _ast.Name):',
    '                if _node.func.id in _fk:',
    '                    _add(_msg_forbidden_function.format(_node.func.id))',
    '            elif isinstance(_node.func, _ast.Attribute):',
    '                if _node.func.attr in _fk:',
    '                    _add(_msg_forbidden_method.format(_node.func.attr))',
    '        else:',
    '            for _kw, _nt in _KW_NODES.items():',
    '                if _kw in _fk and isinstance(_node, _nt):',
    '                    _add(_msg_forbidden_keyword.format(_kw))',
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
    '                    "message": str(e) if str(e) else _msg_assertion_failed',
    '                })',
    '            except Exception as e:',
    '                _results["tests"].append({"passed": False, "message": _msg_test_error.format(e)})',
    '    except SyntaxError as e:',
    '        _results["student_error"] = _msg_syntax_error.format(e)',
    '',
    'json.dumps(_results)',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Python: submission encoder
  // ---------------------------------------------------------------------------
  // Encoding: JSON → UTF-8 bytes → XOR with cycling key → Base64.
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
      '<strong>' + L.violationsHeader + '</strong>' +
      '<ul class="py-exercise-violation-list">' + items + '</ul>' +
      '</div>';
  }

  function renderResult(area, data, label, showHints) {
    var html = '';

    if (data.student_error) {
      area.innerHTML =
        '<div class="py-exercise-error">' +
        '<strong>' + L.errorHeader + '</strong>' +
        '<pre>' + escapeHtml(data.student_error) + '</pre>' +
        '</div>';
      return;
    }

    if (data.stdout && data.stdout.trim()) {
      html +=
        '<div class="py-exercise-stdout">' +
        '<span class="py-exercise-stdout-label">' + L.stdoutLabel + '</span>' +
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
      html += '<div class="py-exercise-all-passed">' + L.allPassed(total) + '</div>';
    } else {
      html += '<div class="py-exercise-some-failed">' + L.someFailed(passed, total) + '</div>';
    }

    if (total > 1) {
      html += '<ul class="py-exercise-test-list">';
      tests.forEach(function (t, i) {
        if (t.passed) {
          html += '<li class="py-test-pass">✓ Test ' + (i + 1) + '</li>';
        } else {
          html +=
            '<li class="py-test-fail">✗ Test ' + (i + 1) +
            (showHints !== false && t.message ? ': ' + escapeHtml(t.message) : '') +
            '</li>';
        }
      });
      html += '</ul>';
    } else if (!allPass && showHints !== false && tests[0] && tests[0].message) {
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
    var showHints         = exerciseData.showTestHints !== false;

    // localStorage key scoped to this page + label
    var storageKey = 'pyex|' + window.location.pathname + '|' + label;
    var savedCode = null;
    try { savedCode = localStorage.getItem(storageKey); } catch (e) {}

    // Monaco editor container
    var editorContainer = document.createElement('div');
    editorContainer.className = 'py-exercise-editor';
    container.appendChild(editorContainer);

    // Button bar
    var buttonBar = document.createElement('div');
    buttonBar.className = 'py-exercise-buttons';

    var checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-primary py-exercise-check';
    checkBtn.innerHTML = L.btnCheck;
    checkBtn.type = 'button';
    checkBtn.title = L.btnCheckTitle;

    var resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-light py-exercise-reset';
    resetBtn.innerHTML = L.btnReset;
    resetBtn.type = 'button';
    resetBtn.title = L.btnResetTitle;

    buttonBar.appendChild(checkBtn);
    buttonBar.appendChild(resetBtn);
    container.appendChild(buttonBar);

    var resultArea = document.createElement('div');
    resultArea.className = 'py-exercise-result';
    container.appendChild(resultArea);

    var editor;
    require(['vs/editor/editor.main'], function () {
      editor = monaco.editor.create(editorContainer, {
        value: savedCode !== null ? savedCode : starterCode,
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

      // Persist code across reloads
      var saveTimer;
      editor.onDidChangeModelContent(function () {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          try { localStorage.setItem(storageKey, editor.getValue()); } catch (e) {}
        }, 500);
      });

      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, runCheck);
    });

    async function runCheck() {
      if (!editor) return;

      resultArea.innerHTML = '<div class="py-exercise-running">' + L.running + '</div>';
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
        renderResult(resultArea, data, label, showHints);

      } catch (err) {
        resultArea.innerHTML =
          '<div class="py-exercise-error">' +
          '<strong>' + L.unexpectedError + '</strong>' +
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
      try { localStorage.removeItem(storageKey); } catch (e) {}
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
        '<h5 class="py-submission-title">' + L.submissionTitle + '</h5>' +
        '<div class="py-submission-fields">' +
          '<div class="py-submission-field">' +
            '<label for="py-submission-student-id">' + L.studentIdLabel + '</label>' +
            '<input type="text" id="py-submission-student-id" ' +
                   'placeholder="' + escapeHtml(L.studentIdPlaceholder) + '" autocomplete="off">' +
          '</div>' +
          '<div class="py-submission-field">' +
            '<label for="py-submission-quiz-id">' + L.quizIdLabel + '</label>' +
            '<input type="text" id="py-submission-quiz-id" ' +
                   'placeholder="' + escapeHtml(L.quizIdPlaceholder) + '" autocomplete="off">' +
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
    btn.innerHTML = L.exportBtn;
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
    outLabel.textContent = L.outputLabel;

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-light btn-sm py-submission-copy-btn';
    copyBtn.id = 'py-submission-copy-btn';
    copyBtn.type = 'button';
    copyBtn.innerHTML = L.copyBtn;
    copyBtn.onclick = function () {
      var text = (document.getElementById('py-submission-output') || {}).value || '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.innerHTML = L.copyOk;
        copyBtn.classList.add('py-submission-copy-ok');
        setTimeout(function () {
          copyBtn.innerHTML = L.copyBtn;
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
          '<div class="py-submission-error">' + escapeHtml(L.validationError) + '</div>';
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
          '<div class="py-submission-error">' +
          escapeHtml(L.encodingError) + escapeHtml(String(err)) +
          '</div>';
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
    a.download = L.downloadFilename + new Date().toISOString().slice(0, 10) + '.json';
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
    btn.innerHTML = L.downloadBtn;
    btn.type = 'button';
    btn.title = L.downloadBtnTitle;
    btn.onclick = downloadAll;

    var hint = document.createElement('span');
    hint.className = 'py-download-hint';
    hint.textContent = L.downloadHint;

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
      // Set Python message globals once – used by CHECKER_PY and RUNNER_PY
      mainPyodide.globals.set('_msg_forbidden_import',   L.msgForbiddenImport);
      mainPyodide.globals.set('_msg_forbidden_function', L.msgForbiddenFunction);
      mainPyodide.globals.set('_msg_forbidden_method',   L.msgForbiddenMethod);
      mainPyodide.globals.set('_msg_forbidden_keyword',  L.msgForbiddenKeyword);
      mainPyodide.globals.set('_msg_assertion_failed',   L.msgAssertionFailed);
      mainPyodide.globals.set('_msg_test_error',         L.msgTestError);
      mainPyodide.globals.set('_msg_syntax_error',       L.msgSyntaxError);

      var exercises = window.__pyExercises || [];
      exercises.forEach(setupExercise);
      initSubmission();
      initDownload();
    });
  });

})();
