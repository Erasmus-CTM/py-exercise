(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  // The page-wide Python runtime shared with math-exercise (ctm-libs'
  // runtime/pyodide-runtime.js, loaded once per page as the ctm-runtime
  // dependency). It reuses pyodide-interaktiv's runtime when present and asks
  // again for every run, because that runtime can be replaced (Stop/restart).
  function loadScript(src) { return globalThis.MathExerciseRuntime.loadScript(src); }
  function ensurePyodide() { return globalThis.MathExerciseRuntime.ensurePyodide(); }
  function runtimeUnavailable(error) {
    return error && (error.code === 'pyodide-timeout' || /^Failed to load: https?:/.test(String(error.message || '')));
  }


  // All exercises on a page share one Python namespace: each check's
  // set-globals/evaluate sequence runs as one transaction, in click order.
  var pythonQueue = Promise.resolve();
  function pythonTransaction(run) {
    var result = pythonQueue.then(run);
    pythonQueue = result.catch(function () {});
    return result;
  }

  // Monaco is normally already loaded by the pyodide extension. If not (standalone
  // use), we load the AMD loader from CDN and let it fetch the editor itself.
  async function ensureMonaco() {
    var cdnBase = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.46/min/vs';
    if (typeof require === 'undefined') {
      await loadScript(cdnBase + '/loader.js');
    }
    require.config({ paths: { vs: cdnBase } });
    await new Promise(function (resolve, reject) {
      require(['vs/editor/editor.main'], function () { resolve(); }, reject);
    });
  }

  // A script tag that already failed never fires again; do not wait forever.
  function withTimeout(promise, ms, message) {
    return Promise.race([promise, new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error(message)); }, ms);
    })]);
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

  var submissionConfig = window.__pyExerciseConfig || { submission: false, submissionKey: 'py-exercise', lang: 'en' };
  // Interface texts: ctm-libs' message catalogue (locales/py-exercise.js),
  // compiled for the page's language (an unknown language gives English).
  var L = CTMLocales.table('py-exercise', submissionConfig.lang);
  var StoreText = CTMLocales.table('ui', submissionConfig.lang);

  // Map of exercise label → { label, passed, total, tests: [bool, ...] }
  var exerciseResults = {};

  // Map of exercise label → Monaco editor instance
  var exerciseEditors = {};

  // ---------------------------------------------------------------------------
  // Python: the checker, runner and encoder live in a private module
  // (_ctm_py_exercise), not in the interpreter's global namespace, which
  // pyodide-interaktiv cells use like a notebook. Every check runs the
  // learner's code in a fresh namespace; interpreter state it changes
  // (builtins, sys.stdout, recursion limit, ...) is restored afterwards
  // (_ctm_guard, ctm-libs' runtime/pyodide-runtime.js).
  // ---------------------------------------------------------------------------
  var PY_MODULE = '_ctm_py_exercise';
  var MODULE_PY = [
    'import ast as _ast, io as _io, json as _json, base64 as _b64, sys as _sys, traceback as _traceback',
    'try:',
    '    import _ctm_guard',
    'except ImportError:  # native test runners',
    '    _ctm_guard = None',
    '',
    '_KW_NODES = {',
    '    "for": _ast.For, "while": _ast.While, "with": _ast.With, "lambda": _ast.Lambda,',
    '    "class": _ast.ClassDef, "global": _ast.Global, "nonlocal": _ast.Nonlocal, "try": _ast.Try,',
    '    "raise": _ast.Raise, "del": _ast.Delete, "assert": _ast.Assert, "yield": _ast.Yield,',
    '}',
    '',
    'def violations(code, forbidden_imports, forbidden_keywords, messages):',
    '    found = []',
    '    def add(message):',
    '        if message not in found:',
    '            found.append(message)',
    '    try:',
    '        tree = _ast.parse(code)',
    '    except SyntaxError:',
    '        return found',
    '    for node in _ast.walk(tree):',
    '        if isinstance(node, _ast.Import):',
    '            for alias in node.names:',
    '                top = alias.name.split(".")[0]',
    '                if top in forbidden_imports:',
    '                    add(messages["forbidden_import"].format(top))',
    '        elif isinstance(node, _ast.ImportFrom):',
    '            if node.module:',
    '                top = node.module.split(".")[0]',
    '                if top in forbidden_imports:',
    '                    add(messages["forbidden_import"].format(top))',
    '        elif isinstance(node, _ast.Call):',
    '            if isinstance(node.func, _ast.Name) and node.func.id in forbidden_keywords:',
    '                add(messages["forbidden_function"].format(node.func.id))',
    '            elif isinstance(node.func, _ast.Attribute) and node.func.attr in forbidden_keywords:',
    '                add(messages["forbidden_method"].format(node.func.attr))',
    '        else:',
    '            for keyword, node_type in _KW_NODES.items():',
    '                if keyword in forbidden_keywords and isinstance(node, node_type):',
    '                    add(messages["forbidden_keyword"].format(keyword))',
    '    return found',
    '',
    'def run(code, tests, messages):',
    '    namespace = {}  # as before 0.3: __name__ is not "__main__", so main() blocks do not run',
    '    results = {"student_error": None, "stdout": "", "tests": []}',
    '    state = _ctm_guard.snapshot() if _ctm_guard else None',
    '    buffer = _io.StringIO()',
    '    stdout = _sys.stdout',
    '    try:',
    '        _sys.stdout = buffer',
    '        try:',
    '            exec(compile(code, "<student>", "exec"), namespace)',
    '        except (Exception, SystemExit):',
    '            results["student_error"] = _traceback.format_exc()',
    '        results["stdout"] = buffer.getvalue()',
    '        if results["student_error"] is None:',
    '            try:',
    '                tree = _ast.parse(tests)',
    '            except SyntaxError as error:',
    '                results["student_error"] = messages["syntax_error"].format(error)',
    '                tree = None',
    '            for statement in (tree.body if tree else []):',
    '                single = compile(_ast.Module(body=[statement], type_ignores=[]), "<test>", "exec")',
    '                try:',
    '                    exec(single, namespace)',
    '                    results["tests"].append({"passed": True})',
    '                except AssertionError as error:',
    '                    results["tests"].append({"passed": False, "message": str(error) if str(error) else messages["assertion_failed"]})',
    '                except (Exception, SystemExit) as error:',
    '                    results["tests"].append({"passed": False, "message": messages["test_error"].format(error)})',
    '    finally:',
    '        _sys.stdout = stdout',
    '        if state is not None:',
    '            _ctm_guard.restore(state)',
    '    return results',
    '',
    'def encode(payload, key):',
    '    key = key.encode("utf-8")',
    '    raw = _json.dumps(payload, ensure_ascii=False).encode("utf-8")',
    '    return _b64.b64encode(bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))).decode("ascii")',
    '',
    'def call(caller):',
    '    # The request arrives as one JSON string in the shared namespace; take it out.',
    '    request = _json.loads(caller.pop("_ctm_py_request"))',
    '    function = {"violations": violations, "run": run, "encode": encode}[request["function"]]',
    '    return _json.dumps(function(*request["args"]))',
  ].join('\n');
  var CALL_PY = '__import__("' + PY_MODULE + '").call(globals())';

  // Calls a function of the private module on the current runtime, installing
  // it first (again after a restart, or after other code on the page removed it).
  async function pythonCall(py, name, args) {
    var runtime = globalThis.MathExerciseRuntime;
    for (var attempt = 0; ; attempt++) {
      await runtime.ensureGuard(py);
      await runtime.installModule(py, PY_MODULE, MODULE_PY);
      await py.globals.set('_ctm_py_request', JSON.stringify({ function: name, args: args }));
      try {
        return JSON.parse(await py.runPythonAsync(CALL_PY));
      } catch (error) {
        if (attempt || !/No module named '_ctm_|has no attribute 'call'/.test(String(error))) throw error;
        runtime.forgetModules(py);
      }
    }
  }
  function messages() {
    return {
      forbidden_import: L.msgForbiddenImport, forbidden_function: L.msgForbiddenFunction,
      forbidden_method: L.msgForbiddenMethod, forbidden_keyword: L.msgForbiddenKeyword,
      assertion_failed: L.msgAssertionFailed, test_error: L.msgTestError, syntax_error: L.msgSyntaxError,
    };
  }

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

  // py-exercise alone knows its old key format. The shared store decides
  // whether migration is enabled and commits the new record before removal.
  function legacyCode(label, starterCode) {
    function paths() {
      var current = window.location.pathname, alternatives = [current];
      function add(value) { if (alternatives.indexOf(value) < 0) alternatives.push(value); }
      var base = current.replace(/\.html$/, '');
      if (/\/$/.test(base)) base += 'index';
      if (/\/index$/.test(base)) {
        add(base + '.html'); add(base); add(base.slice(0, -5));
      } else {
        add(base + '.html'); add(base);
      }
      return alternatives;
    }
    return {
      read: function () {
        var candidates = paths().map(function (page) { return 'pyex|' + page + '|' + label; });
        var code = null, found = [];
        candidates.forEach(function (key) {
          var value = window.localStorage.getItem(key);
          if (value !== null) { found.push(key); if (code === null) code = value; }
        });
        return code === null ? null : {inputs: code === starterCode ? null : {code: code}, keys: found};
      },
      remove: function (candidate) {
        candidate.keys.forEach(function (key) { window.localStorage.removeItem(key); });
      }
    };
  }

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
    // caption is metadata only (used in downloadAll JSON), not rendered visually


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
    var storeHandle = null;
    var savedOffer = null;
    var writingEditor = false;
    var editRevision = 0;
    var assessment = null;
    var feedbackAdapter = null;
    function clearFeedback() {
      assessment = null;
      if (feedbackAdapter) feedbackAdapter.invalidate();
    }
    require(['vs/editor/editor.main'], function () {
      editor = monaco.editor.create(editorContainer, {
        value: starterCode,
        language: 'python',
        theme: 'vs',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        minimap: { enabled: false },
        fontSize: 14,
        renderLineHighlight: 'none',
        hideCursorInOverviewRuler: true,
      });

      // Store reference so downloadAll() can read the current code later
      exerciseEditors[label] = editor;

      if (submissionConfig.feedback) {
        feedbackAdapter = window.PyExerciseFeedback.attach({
          container: container, buttonBar: buttonBar, label: label,
          uiLanguage: submissionConfig.lang || 'en',
          feedbackLanguage: exerciseData.feedbackLanguage || submissionConfig.lang || 'en',
          learnerLevel: exerciseData.learnerLevel || '', task: exerciseData.task, feedbackContext: exerciseData.feedbackContext, policySelection: exerciseData.policySelection,
          forbiddenImports: forbiddenImports, forbiddenKeywords: forbiddenKeywords,
          getCode: function () { return editor.getValue(); },
          getAssessment: function () { return assessment; }
        });
      }

      var updateHeight = function () {
        var h = Math.max(80, editor.getContentHeight());
        editorContainer.style.height = h + 'px';
        editor.layout();
      };
      editor.onDidContentSizeChange(updateHeight);
      updateHeight();

      // Monaco fires a change for setValue too. Restore and reset must not
      // create a fresh save or make an in-flight check current again.
      function setCode(code) {
        writingEditor = true;
        try { editor.setValue(code); } finally { writingEditor = false; }
        editRevision++;
      }
      function clearCode() {
        if (savedOffer) { savedOffer.remove(); savedOffer = null; }
        clearFeedback();
        feedbackAdapter?.reset();
        setCode(starterCode);
        delete exerciseResults[label];
        resultArea.innerHTML = '';
      }
      if (globalThis.CTMStore) {
        storeHandle = CTMStore.register({
          component: 'py-exercise', id: exerciseData.storeId || label,
          element: container, source: exerciseData.source || '', save: exerciseData.save !== false,
          read: function () { var code = editor.getValue(); return code === starterCode ? null : {code: code}; },
          write: function (inputs, meta) {
            if (inputs && typeof inputs.code === 'string') setCode(inputs.code);
            clearFeedback();
            delete exerciseResults[label];
            resultArea.innerHTML = '';
          },
          clear: clearCode,
          legacy: [legacyCode(exerciseData.storeId || label, starterCode)],
          exportItem: function () {
            var code = editor.getValue();
            var parts = [{kind: 'code', label: label, text: code}];
            if (assessment && assessment.code === code && assessment.result.stdout) {
              parts.push({kind: 'output', label: label, text: assessment.result.stdout});
            }
            return {title: exerciseData.caption || label, parts: parts};
          }
        });
        var restored = storeHandle.restore();
        if (restored && restored.record) {
          if (restored.state === 'changed' || restored.state === 'withdrawn') {
            savedOffer = document.createElement('details');
            savedOffer.className = 'py-exercise-saved-outdated';
            var summary = document.createElement('summary');
            summary.textContent = StoreText.sourceChanged + ' ' + StoreText.showSaved;
            var oldCode = document.createElement('pre');
            oldCode.textContent = restored.record.inputs && restored.record.inputs.code || '';
            savedOffer.appendChild(summary); savedOffer.appendChild(oldCode);
            container.appendChild(savedOffer);
          }
          var last = restored.record.result;
          if (last) {
            var previousResult = document.createElement('div');
            previousResult.className = 'py-exercise-saved-result';
            previousResult.style.opacity = '0.65';
            var statusText = {correct: StoreText.statusCorrect, partial: StoreText.statusPartial,
              wrong: StoreText.statusWrong, invalid: StoreText.statusInvalid}[last.status] || last.status;
            var date = last.at ? new Date(last.at).toLocaleDateString(submissionConfig.lang || 'en') : '';
            previousResult.textContent = StoreText.lastChecked(date, statusText,
              typeof last.score === 'number' ? Math.round(last.score * 100) : 0) +
              (restored.outdated ? ' — ' + StoreText.outdated : '');
            resultArea.appendChild(previousResult);
          }
        }
      }
      editor.onDidChangeModelContent(function () {
        if (writingEditor) return;
        editRevision++;
        clearFeedback();
        delete exerciseResults[label];
        resultArea.innerHTML = '';
        if (storeHandle) storeHandle.changed();
      });

      // addCommand registers a global keybinding (the last registration wins),
      // so bind Shift+Enter to this exercise whenever its editor gains focus.
      // The context key keeps it out of other Monaco editors on the page.
      var keyContext = typeof editor.createContextKey === 'function'
        ? (editor.createContextKey('pyExerciseEditor', true), 'pyExerciseEditor') : undefined;
      var bindCheckKey = function () { editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, runCheck, keyContext); };
      editor.onDidFocusEditorText(bindCheckKey);
      bindCheckKey();
    });

    var running = false;
    async function runCheck() {
      // Shift+Enter bypasses the disabled button; never queue duplicates.
      if (!editor || running) return;
      running = true;
      feedbackAdapter?.reset('run');
      clearFeedback();

      resultArea.innerHTML = '<div class="py-exercise-running">' + L.running + '</div>';
      // A runtime in a worker (pyodide-interaktiv) can be stopped; Python on
      // the page itself cannot, the page then only reloads.
      // `py-exercise: stop-after:` / `ctm-assessment: stop-after:` (default 20 s).
      var runtime = globalThis.MathExerciseRuntime;
      var stops = null, cancelSlow = function () {};
      checkBtn.disabled = true;
      resetBtn.disabled = true;

      var studentCode = editor.getValue();
      var checkedRevision = editRevision;

      try {
        stops = runtime.stopCount();
        // The clock starts once Python and the packages are loaded: on a slow
        // network the first load alone can take longer than stop-after.
        var startSlow = function (ms) {
          cancelSlow();
          cancelSlow = runtime.whenSlow(ms || window.__pyExerciseSlowCheckMs ||
            (Number(submissionConfig.stopAfter) > 0 ? Number(submissionConfig.stopAfter) * 1000 : 20000), function () {
            var note = resultArea.querySelector('.py-exercise-running');
            if (!note) return;
            note.textContent = (ms ? L.slowLoad || L.slowCheck : L.slowCheck) + ' ';   // ms: the load limit
            var stopBtn = document.createElement('button');
            stopBtn.type = 'button';
            stopBtn.className = 'btn btn-sm btn-outline-danger py-exercise-stop';
            stopBtn.textContent = L.stop;
            stopBtn.addEventListener('click', function () { runtime.stop('Stopped by the learner'); });
            note.appendChild(stopBtn);
          });
        };
        var used = null;
        var check = function () {
          return pythonTransaction(async function () {
            var py = used = await ensurePyodide();
            if (forbiddenImports.length > 0 || forbiddenKeywords.length > 0) {
              var violations = await pythonCall(py, 'violations', [studentCode, forbiddenImports, forbiddenKeywords, messages()]);
              if (violations.length > 0) return { violations: violations };
            }
            await py.loadPackagesFromImports(studentCode);
            startSlow();
            return { data: await pythonCall(py, 'run', [studentCode, testsCode, messages()]) };
          });
        };
        var outcome;
        try {
          startSlow(runtime.loadTimeout);   // a load that never finishes can still be stopped
          outcome = await check();
        } catch (error) {
          // Python restarted by other means (an interactive cell's Stop or
          // restart): repeat the check once on the new runtime, as math-exercise
          // does. The runtime object tells, not the (translated) error text.
          startSlow(runtime.loadTimeout);
          if (runtime.stopCount() !== stops || !used || (await ensurePyodide()) === used) throw error;
          outcome = await check();
        }
        if (outcome.violations) {
          if (checkedRevision !== editRevision) return;
          renderViolations(resultArea, outcome.violations);
          if (storeHandle) storeHandle.result({status: 'invalid', score: 0});
          if (editor.getValue() === studentCode) assessment = {code: studentCode, result: {status: 'blocked by assignment restrictions'}};
          return;
        }
        var data = outcome.data;
        if (checkedRevision !== editRevision) return;
        renderResult(resultArea, data, label, showHints);
        if (storeHandle) {
          var total = (data.tests || []).length;
          var passed = (data.tests || []).filter(function (test) { return test.passed; }).length;
          storeHandle.result({status: data.student_error || !total ? 'invalid' :
            passed === total ? 'correct' : passed ? 'partial' : 'wrong',
            score: total ? passed / total : 0});
        }
        if (editor.getValue() === studentCode) assessment = {code: studentCode, result: {
          status: data.student_error ? 'learner code raised an error' : 'checked',
          passed: (data.tests || []).filter(function (t) { return t.passed; }).length,
          total: (data.tests || []).length,
          stdout: data.stdout || ''
        }};

      } catch (err) {
        if (checkedRevision !== editRevision) return;
        // Stopped from this or any other component's Stop button.
        resultArea.innerHTML = stops !== null && runtime.stopCount() !== stops
          ? '<div class="py-exercise-error">' + escapeHtml(L.stopped) + '</div>'
          : runtimeUnavailable(err)
          ? '<div class="py-exercise-error">' + escapeHtml(L.pythonUnavailable) + '</div>'
          : '<div class="py-exercise-error">' +
            '<strong>' + L.unexpectedError + '</strong>' +
            '<pre>' + escapeHtml(String(err)) + '</pre>' +
            '</div>';
      } finally {
        cancelSlow();
        running = false;
        checkBtn.disabled = false;
        resetBtn.disabled = false;
      }
    }

    checkBtn.onclick = runCheck;
    resetBtn.onclick = function () {
      if (storeHandle) storeHandle.clear();
      else {
        clearFeedback();
        feedbackAdapter?.reset();
        if (editor) {
          writingEditor = true;
          try { editor.setValue(starterCode); } finally { writingEditor = false; }
          editRevision++;
        }
        delete exerciseResults[label];
        resultArea.innerHTML = '';
      }
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
      var encoded = await pythonTransaction(async function () {
        var py = await ensurePyodide();
        return pythonCall(py, 'encode', [payload, submissionConfig.submissionKey || 'py-exercise']);
      });

      if (outArea)  outArea.value = encoded;
      if (outWrap)  outWrap.style.display = '';
      if (msgEl)    msgEl.innerHTML = '';

    } catch (err) {
      if (msgEl) {
        msgEl.innerHTML =
          '<div class="py-submission-error">' +
          (runtimeUnavailable(err) ? escapeHtml(L.pythonUnavailable) : escapeHtml(L.encodingError) + escapeHtml(String(err))) +
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
  document.addEventListener('DOMContentLoaded', async function () {
    // Editors appear as soon as Monaco is ready; Python loads in the
    // background and the first Check waits for it (and reports a failure).
    ensurePyodide().catch(function (error) {
      console.warn('py-exercise: Pyodide preload failed (will retry on Check):', error);
    });
    var monaco = ensureMonaco();
    var ready = false;
    function setUpExercises() {
      if (ready) return;
      ready = true;
      (window.__pyExercises || []).forEach(setupExercise);
      initSubmission();
      initDownload();
    }
    try {
      await withTimeout(monaco, 60000, 'Timed out loading the Monaco editor');
    } catch (error) {
      console.warn('py-exercise: the code editor could not be loaded:', error);
      (window.__pyExercises || []).forEach(function (exercise) {
        var container = document.getElementById('py-exercise-' + exercise.id);
        if (!container) return;
        var message = document.createElement('div');
        message.className = 'py-exercise-error';
        message.textContent = L.editorUnavailable;
        container.replaceChildren(message);
      });
      // On a slow connection the editor may still arrive; it then replaces the messages.
      monaco.then(setUpExercises, function () {});
      return;
    }
    setUpExercises();
  });

})();
