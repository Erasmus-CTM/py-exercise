// Browser-runtime regressions for py-exercise.js, run in jsdom against a fake
// shared Python interpreter (no CDN): checks pressed before Python is ready,
// a runtime replaced by pyodide-interaktiv, an unreachable editor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { LOCALE, RUNTIME, sources } = require('./helpers/ctm-libs.cjs');

// As the page loads them: ctm-libs' runtime and catalogue, then the exercise script.
const componentSource = fs.readFileSync(path.join(__dirname, '../_extensions/py-exercise/py-exercise.js'), 'utf8');
const sharedSource = sources(['assets.js', 'ui/ctm-layout.js', ...RUNTIME, ...LOCALE, 'locales/ui.js']).join('\n');
const source = sharedSource + '\n' + componentSource;
const assetTable = JSON.parse(fs.readFileSync(path.join(require('./helpers/ctm-libs.cjs').ctmLibs, 'assets.json'), 'utf8'));
const runtimeURL = sources(RUNTIME)[0].match(/var indexURL = '([^']+)'/)[1];
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// One namespace shared by all exercises, like Pyodide's globals; the private
// module is installed per interpreter. Evaluation reads the namespace when it
// runs, after an asynchronous hop.
function fakeInterpreter() {
  const globals = new Map();
  const modules = new Set();
  const self = {
    globals: { set: (name, value) => { globals.set(name, value); } },
    toPy: value => value,
    loadPackagesFromImports: async () => {},
    modules,
    runPythonAsync: async code => {
      if (code.includes('ModuleType(')) { modules.add(code.match(/ModuleType\("([^"]+)"\)/)[1]); return undefined; }
      await tick(5);
      if (!modules.has('_ctm_py_exercise')) throw new Error("ModuleNotFoundError: No module named '_ctm_py_exercise'");
      const request = JSON.parse(globals.get('_ctm_py_request')); globals.delete('_ctm_py_request');
      if (request.function === 'violations') return '[]';
      if (request.function === 'encode') return JSON.stringify('encoded');
      self.runs++;
      const [student, tests] = request.args;
      const passed = student.includes('return a + b') && tests.includes('add(');
      return JSON.stringify({ stdout: '', student_error: null, tests: [{ passed, message: tests }] });
    },
    runs: 0,
  };
  return self;
}

function page(exercises, { monaco = true, monacoDelay = 0, editorDelay = monacoDelay, assetMode = 'cdn', pageURL = 'https://example.org/p.html', editorError = null, secondRequireError = null } = {}) {
  const cells = exercises.map(e => '<div class="py-exercise-cell" id="py-exercise-' + e.id + '"></div>').join('');
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + cells + '</body></html>', { url: pageURL, runScripts: 'outside-only' });
  const w = dom.window;
  w.CTM_ASSETS = {v: 1, mode: assetMode, bases: Object.fromEntries(Object.entries(assetTable.assets).map(([name,entry]) =>
    [name, assetMode === 'local' ? '../_ctm-assets/' + entry.local.replaceAll('{version}',entry.version) :
      entry.cdn.replaceAll('{version}',entry.version)]))};
  w.CTM_ASSETS.bases.pyodide = assetMode === 'local' ?
    '../_ctm-assets/pyodide/' + runtimeURL.match(/\/v([^/]+)\/full\//)[1] + '/' : runtimeURL;
  w.__pyExerciseConfig = { submission: false, lang: 'en' };
  w.__pyExercises = exercises;
  let requireCalls = 0;
  w.require = (deps, ok, fail) => { const call=++requireCalls; return setTimeout(() => {
    if(secondRequireError && call>1) fail(secondRequireError);
    else if(monaco) ok(); else fail(new Error('offline'));
  }, call > 1 ? editorDelay : monacoDelay); };
  w.require.config = config => { w.monacoVsPath = config.paths.vs; };
  // Monaco's addCommand is a global keybinding: the last registration wins.
  const keys = {}, editors = [];
  w.monaco = { KeyMod: { Shift: 1 }, KeyCode: { Enter: 2 }, editor: { create: (el, options) => {
    if(editorError) throw editorError;
    let value = options.value, focus = () => {}, changed = () => {};
    const editor = { getValue: () => value, setValue: v => { value = v; changed(); }, getContentHeight: () => 100, layout() {},
      onDidContentSizeChange() {}, onDidChangeModelContent(fn) { changed = fn; }, onDidFocusEditorText(fn) { focus = fn; },
      addCommand(key, fn) { keys[key] = fn; }, focus: () => focus() };
    editors.push(editor);
    return editor;
  } } };
  const shiftEnter = () => keys[1 | 2]();
  return { w, dom, editors, shiftEnter };
}
const exercises = () => [
  { id: 1, label: 'add', starter: 'def add(a, b):\n    return a + b', tests: 'assert add(1, 2) == 3', forbiddenImports: [], forbiddenKeywords: [] },
  { id: 2, label: 'square', starter: 'def square(n):\n    pass', tests: 'assert square(3) == 9', forbiddenImports: [], forbiddenKeywords: [] },
];
const result = (w, id) => w.document.querySelector('#py-exercise-' + id + ' .py-exercise-result').textContent;
async function until(predicate, ms = 3000) {
  for (let t = 0; t < ms; t += 10) { if (predicate()) return; await tick(10); }
  throw new Error('timeout');
}

test('editors appear before Python; two checks pressed while it loads keep their own results', async () => {
  const { w, dom } = page(exercises());
  let ready; w.qpyodideInstance = new Promise(resolve => { ready = resolve; });
  w.eval(source);
  await until(() => w.document.querySelectorAll('.py-exercise-check').length === 2);
  await tick(20); // editors are created in Monaco's (asynchronous) require callback
  const [a, b] = w.document.querySelectorAll('.py-exercise-check');
  a.click(); b.click();
  ready(fakeInterpreter());
  await until(() => !/Checking/.test(result(w, 1) + result(w, 2)) && result(w, 1) && result(w, 2)).catch(e => { throw new Error('timeout: ' + result(w, 1) + ' | ' + result(w, 2)); });
  assert.match(result(w, 1), /All 1 test passed/);
  assert.match(result(w, 2), /0 of 1/);
  dom.window.close();
});

test('a runtime replaced by pyodide-interaktiv (Stop/restart) gets the checker module again', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed/.test(result(w, 1)));
  w.mainPyodide = undefined;
  w.qpyodideInstance = Promise.resolve(fakeInterpreter()); // a fresh interpreter: no checker module yet
  w.document.querySelector('.py-exercise-result').textContent = '';
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed|error/i.test(result(w, 1)));
  assert.match(result(w, 1), /All 1 test passed/);
  dom.window.close();
});

test('an unreachable code editor shows a message instead of an empty page', async () => {
  const { w, dom } = page(exercises(), { monaco: false });
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(() => w.document.querySelectorAll('.py-exercise-error').length === 2);
  assert.match(w.document.querySelector('#py-exercise-1').textContent, /code editor could not be loaded/);
  dom.window.close();
});

test('the page is set up once: one editor per exercise', async () => {
  const { w, dom, editors } = page(exercises());
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(() => w.document.querySelectorAll('.py-exercise-check').length === 2);
  await tick(50);
  assert.equal(editors.length, 2);
  assert.equal(w.document.querySelectorAll('.py-exercise-check').length, 2);
  dom.window.close();
});

test('Shift+Enter checks the focused exercise, once while a check runs', async () => {
  const { w, dom, editors, shiftEnter } = page(exercises());
  const interpreter = fakeInterpreter();
  w.qpyodideInstance = Promise.resolve(interpreter);
  w.eval(source);
  await until(() => editors.length === 2);
  await tick(20);
  editors[0].focus();         // the second editor registered last; focus re-binds
  shiftEnter(); shiftEnter(); // a second press while running is ignored
  await until(() => /passed|test/.test(result(w, 1)));
  await tick(50);
  assert.match(result(w, 1), /All 1 test passed/);
  assert.equal(result(w, 2), '');
  assert.equal(interpreter.runs, 1);
  dom.window.close();
});

test('an editor that arrives after the 60 s limit still replaces the message', { timeout: 90000 }, async () => {
  const { w, dom, editors } = page(exercises().slice(0, 1), { monacoDelay: 61000, editorDelay: 0 });
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-error'), 62000);
  await until(() => editors.length === 1, 5000);
  assert.equal(w.document.querySelector('.py-exercise-error'), null);
  dom.window.close();
});

test('Python that never finishes loading reports a message and a later Check retries', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  let loads = 0;
  w.__qExercisePyodideTimeout = 100;
  let pending;
  w.CTMWorker = {page: () => {
    if (!pending) pending = ++loads === 1 ? new Promise(() => {}) : Promise.resolve(fakeInterpreter());
    setTimeout(() => { pending = null; }, 100);
    return pending;
  }};
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /Python could not be loaded/.test(result(w, 1)));
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed/.test(result(w, 1)));
  assert.equal(loads, 2);
  dom.window.close();
});

test('a long check in a worker runtime offers Stop, and stopping is reported', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  w.__pyExerciseSlowCheckMs = 30;
  const interpreter = fakeInterpreter();
  let reject, restarts = 0;
  const run = interpreter.runPythonAsync;
  interpreter.runPythonAsync = code => code.includes('.call(globals())') ? new Promise((_, r) => { reject = r; }) : run(code);
  interpreter.restart = () => { restarts++; reject(new Error('Python was restarted.')); };
  w.qpyodideInstance = Promise.resolve(interpreter);
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => w.document.querySelector('.py-exercise-stop'));
  w.document.querySelector('.py-exercise-stop').click();
  await until(() => /Stopped/.test(result(w, 1)));
  assert.equal(restarts, 1);
  assert.equal(w.document.querySelector('.py-exercise-check').disabled, false);
  dom.window.close();
});

test('loading packages does not count towards stop-after', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  w.__pyExerciseSlowCheckMs = 30;
  const interpreter = fakeInterpreter();
  interpreter.loadPackagesFromImports = () => tick(300);   // a slow network
  interpreter.restart = () => {};
  w.qpyodideInstance = Promise.resolve(interpreter);
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  let offered = false;
  const observer = new w.MutationObserver(() => { offered = offered || !!w.document.querySelector('.py-exercise-stop'); });
  observer.observe(w.document.body, { childList: true, subtree: true });
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed|✓|1\/1/i.test(result(w, 1)) && !w.document.querySelector('.py-exercise-running'));
  observer.disconnect();
  assert.equal(offered, false);
  dom.window.close();
});

test('a package load that never finishes still offers Stop, after the load limit', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  w.__pyExerciseSlowCheckMs = 30;
  w.__qExercisePyodideTimeout = 200;   // the load limit, shortened for the test
  const interpreter = fakeInterpreter();
  let rejectLoad;
  interpreter.loadPackagesFromImports = () => new Promise((_, reject) => { rejectLoad = reject; });
  interpreter.restart = () => rejectLoad(new Error('Python was restarted.'));
  w.qpyodideInstance = Promise.resolve(interpreter);
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await tick(100);
  assert.equal(w.document.querySelector('.py-exercise-stop'), null, 'not before the load limit');
  await until(() => w.document.querySelector('.py-exercise-stop'), 3000);
  w.document.querySelector('.py-exercise-stop').click();
  await until(() => /Stopped/.test(result(w, 1)));
  assert.equal(w.document.querySelector('.py-exercise-check').disabled, false);
  dom.window.close();
});

test('a Stop from another component cancels active and queued checks without grading or replay', async () => {
  const { w, dom } = page(exercises());
  w.__pyExerciseSlowCheckMs = 30;
  const interpreter = fakeInterpreter();
  const pending = [];
  const run = interpreter.runPythonAsync;
  let restarted = false;
  interpreter.runPythonAsync = code => code.includes('.call(globals())') && !restarted ? new Promise((_, r) => pending.push(r)) : run(code);
  interpreter.restart = () => { restarted = true; pending.splice(0).forEach(r => r(new Error('Python was restarted.'))); };
  w.qpyodideInstance = Promise.resolve(interpreter);
  w.eval(source);
  await until(() => w.document.querySelectorAll('.py-exercise-check').length === 2);
  await tick(20);
  const [a, b] = w.document.querySelectorAll('.py-exercise-check');
  a.click(); b.click();
  await until(() => w.document.querySelector('.py-exercise-stop'));
  w.MathExerciseRuntime.stop('another component');   // as math-exercise's Stop would
  // Both submitted operations are cancelled. No hidden replay on a new runtime.
  await until(() => /Stopped/.test(result(w, 1)) && /Stopped/.test(result(w, 2)));
  assert.equal(interpreter.runs, 0);
  assert.doesNotMatch(result(w, 1) + result(w, 2), /Unexpected error/);
  dom.window.close();
});

test('a check interrupted by an interactive cell restart is repeated once on the new runtime', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  const first = fakeInterpreter(), second = fakeInterpreter();
  const run = first.runPythonAsync;
  first.runPythonAsync = async code => {
    if (code.includes('.call(globals())')) {
      w.mainPyodide = undefined; w.qpyodideInstance = Promise.resolve(second);   // the cell's restart
      throw new Error('Abgebrochen – Python wurde neu gestartet');                // translated message
    }
    return run(code);
  };
  w.qpyodideInstance = Promise.resolve(first);
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed|error/i.test(result(w, 1)));
  assert.match(result(w, 1), /All 1 test passed/);
  assert.equal(second.runs, 1);
  dom.window.close();
});

test('an error on the same runtime is not repeated', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  const interpreter = fakeInterpreter();
  let calls = 0;
  const run = interpreter.runPythonAsync;
  interpreter.runPythonAsync = async code => {
    if (code.includes('.call(globals())')) { calls++; throw new Error('BaseException: restarted by the learner code'); }
    return run(code);
  };
  w.qpyodideInstance = Promise.resolve(interpreter);
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-check'));
  await tick(20);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /Unexpected error/.test(result(w, 1)));
  assert.equal(calls, 1);
  dom.window.close();
});


// Store doubles observe only the component boundary. Storage transactions,
// debounce cancellation and privacy switches are tested in ctm-libs.
function observeStore(w, restored) {
  const calls = {changes: 0, clears: 0, results: [], options: null};
  w.CTMStore = {
    register(options) {
      calls.options = options;
      return {
        restore() {
          if (restored && restored.state === 'restored') options.write(restored.record.inputs, restored);
          return restored || {state: 'empty'};
        },
        changed() { calls.changes++; },
        clear() { calls.clears++; options.clear(); },
        result(value) { calls.results.push(value); }
      };
    }
  };
  return calls;
}

test('store restore never checks Python or schedules a synthetic editor save; Reset removes the answer', async () => {
  const {w, dom, editors} = page(exercises().slice(0, 1));
  const py = fakeInterpreter();
  w.qpyodideInstance = Promise.resolve(py);
  const calls = observeStore(w, {state: 'restored', record: {inputs: {code: 'saved code'}, result: {status: 'partial', score: .5}}});
  w.eval(source);
  await until(() => editors.length === 1 && calls.options);
  assert.equal(editors[0].getValue(), 'saved code');
  assert.equal(py.runs, 0);
  assert.equal(calls.changes, 0);
  assert.match(result(w, 1), /partly correct\s*\(50\s*%\)/);
  editors[0].setValue('edit before reset');
  assert.equal(calls.changes, 1);
  w.document.querySelector('.py-exercise-reset').click();
  assert.equal(calls.clears, 1);
  assert.equal(calls.changes, 1, 'reset setValue must not ask for another save');
  assert.equal(editors[0].getValue(), exercises()[0].starter);
  assert.equal(calls.options.read(), null, 'starter removes the answer record');
  assert.equal(result(w, 1), '');
  dom.window.close();
});

test('changed source offers readonly saved code and never fills current inputs', async () => {
  const {w, dom, editors} = page(exercises().slice(0, 1));
  const py = fakeInterpreter();
  w.qpyodideInstance = Promise.resolve(py);
  const calls = observeStore(w, {state: 'changed', outdated: true, record: {inputs: {code: 'old answer'}}});
  w.eval(source);
  await until(() => editors.length === 1 && calls.options);
  assert.equal(editors[0].getValue(), exercises()[0].starter);
  assert.equal(w.document.querySelector('.py-exercise-saved-outdated pre').textContent, 'old answer');
  assert.equal(calls.changes, 0);
  assert.equal(w.document.querySelector('.py-exercise-saved-outdated button'), null);
  assert.equal(editors[0].getValue(), exercises()[0].starter);
  assert.equal(calls.changes, 0);
  assert.equal(py.runs, 0);
  dom.window.close();
});

test('a result from code edited while checking cannot replace current feedback or be saved', async () => {
  const {w, dom, editors} = page(exercises().slice(0, 1));
  const py = fakeInterpreter();
  let complete;
  py.loadPackagesFromImports = () => new Promise(resolve => { complete = resolve; });
  w.qpyodideInstance = Promise.resolve(py);
  const calls = observeStore(w);
  w.eval(source);
  await until(() => editors.length === 1 && calls.options);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => complete);
  editors[0].setValue('different code');
  complete();
  await until(() => !w.document.querySelector('.py-exercise-check').disabled);
  assert.deepEqual(calls.results, []);
  assert.equal(result(w, 1), '');
  dom.window.close();
});

test('legacy pyex lookup gives current path priority, then html, and removes only found variants', async () => {
  for (const pathname of ['/course/page.html', '/course/page', '/course/', '/course/index', '/course/index.html']) {
    const {w, dom, editors} = page(exercises().slice(0, 1));
    w.history.replaceState({}, '', pathname);
    w.qpyodideInstance = Promise.resolve(fakeInterpreter());
    const calls = observeStore(w);
    const base = pathname.includes('index') || pathname.endsWith('/') ? '/course/index' : '/course/page';
    const keys = [base + '.html', base, ...(base.endsWith('index') ? ['/course/'] : [])];
    keys.forEach(p => w.localStorage.setItem('pyex|' + p + '|add', 'code:' + p));
    w.localStorage.setItem('pyex|/other/page|add', 'other course');
    w.eval(source);
    await until(() => editors.length === 1 && calls.options);
    const adapter = calls.options.legacy[0];
    let found = adapter.read();
    assert.equal(found.inputs.code, 'code:' + pathname);
    w.localStorage.removeItem('pyex|' + pathname + '|add');
    found = adapter.read();
    const expected = keys.find(p => p !== pathname);
    assert.equal(found.inputs.code, 'code:' + expected);
    adapter.remove(found);
    assert.equal(adapter.read(), null);
    assert.equal(w.localStorage.getItem('pyex|/other/page|add'), 'other course');
    dom.window.close();
  }
});


test('a starter re-saved by an old cached page migrates as a deletion marker', async () => {
  const {w, dom, editors} = page(exercises().slice(0, 1));
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  const calls = observeStore(w);
  w.localStorage.setItem('pyex|/p.html|add', exercises()[0].starter);
  w.eval(source);
  await until(() => editors.length === 1 && calls.options);
  const candidate = calls.options.legacy[0].read();
  assert.equal(candidate.inputs, null);
  assert.equal(w.localStorage.getItem('pyex|/p.html|add'), exercises()[0].starter, 'read alone must not delete');
  calls.options.legacy[0].remove(candidate);
  assert.equal(w.localStorage.getItem('pyex|/p.html|add'), null);
  dom.window.close();
});


test('Copy answer is available with saving off and copies current code without running Python', async () => {
  const data = exercises().slice(0, 1);
  data[0].save = false;
  const {w, dom, editors} = page(data);
  const py = fakeInterpreter();
  w.qpyodideInstance = Promise.resolve(py);
  const copied = [];
  w.CTMCopy = {text: async (text, options) => { copied.push({text, options}); return {method: 'clipboard'}; }};
  const calls = observeStore(w);
  w.eval(source);
  await until(() => editors.length === 1 && calls.options);
  assert.equal(calls.options.save, false);
  const button = w.document.querySelector('.py-exercise-copy');
  assert.equal(button.disabled, false);
  editors[0].setValue('print("my unsaved answer")');
  button.click();
  await until(() => copied.length === 1);
  assert.equal(copied[0].text, 'print("my unsaved answer")');
  assert.ok(copied[0].options.label.includes('add'));
  assert.equal(py.runs, 0);
  w.document.querySelector('.py-exercise-reset').click();
  button.click();
  await until(() => copied.length === 2);
  assert.equal(copied[1].text, data[0].starter);
  assert.equal(py.runs, 0);
  dom.window.close();
});

test('forget discards saved offers and gray results without changing live editor or output', async () => {
  for (const state of ['restored', 'changed', 'withdrawn']) {
    const {w, dom, editors} = page(exercises().slice(0, 1));
    const py = fakeInterpreter();
    w.qpyodideInstance = Promise.resolve(py);
    const calls = observeStore(w, {state, outdated: state !== 'restored',
      record: {inputs: {code: 'saved answer'}, result: {at: '2026-10-20', status: 'partial', score: .5}}});
    w.eval(source);
    await until(() => editors.length === 1 && calls.options);
    const liveCode = editors[0].getValue();
    const output = w.document.createElement('pre'); output.textContent = 'keep current output';
    w.document.querySelector('.py-exercise-result').append(output);
    const sibling = w.document.createElement('div');
    sibling.className = 'py-exercise-saved-result'; sibling.textContent = 'another exercise history';
    w.document.body.append(sibling);
    assert.ok(w.document.querySelector('#py-exercise-1 .py-exercise-saved-result'));
    calls.options.forget(); calls.options.forget();
    assert.equal(editors[0].getValue(), liveCode);
    assert.equal(output.isConnected, true);
    assert.equal(output.textContent, 'keep current output');
    assert.equal(w.document.querySelector('.py-exercise-saved-outdated'), null);
    assert.equal(w.document.querySelector('#py-exercise-1 .py-exercise-saved-result'), null);
    assert.equal(sibling.textContent, 'another exercise history');
    assert.equal(sibling.isConnected, true);
    assert.equal(calls.changes, 0);
    assert.deepEqual(calls.results, []);
    assert.equal(py.runs, 0);
    dom.window.close();
  }
});

test('forget preserves a current check assessment and feedback adapter state', async () => {
  const {w, dom, editors} = page(exercises().slice(0, 1));
  const py = fakeInterpreter();
  w.qpyodideInstance = Promise.resolve(py);
  const calls = observeStore(w);
  let adapterOptions, resets = 0, invalidations = 0;
  w.__pyExerciseConfig.feedback = true;
  w.PyExerciseFeedback = {attach(options) {
    adapterOptions = options;
    return {reset() {resets++;}, invalidate() {invalidations++;}};
  }};
  w.eval(source);
  await until(() => editors.length === 1 && calls.options && adapterOptions);
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed/.test(result(w, 1)));
  const assessment = adapterOptions.getAssessment(), output = result(w, 1), before = invalidations, beforeResets = resets;
  assert.ok(assessment);
  calls.options.forget();
  assert.equal(adapterOptions.getAssessment(), assessment);
  assert.equal(result(w, 1), output);
  assert.equal(editors[0].getValue(), exercises()[0].starter);
  assert.equal(invalidations, before);
  assert.equal(resets, beforeResets);
  assert.equal(py.runs, 1);
  dom.window.close();
});

test('explicit Reset removes old offers and saved results without saving the starter', async () => {
  const {w, dom, editors} = page(exercises().slice(0, 1));
  const calls = observeStore(w, {state: 'changed', outdated: true,
    record: {inputs: {code: 'old answer'}, result: {at: '2026-10-20', status: 'wrong', score: 0}}});
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(() => editors.length === 1 && calls.options);
  assert.ok(w.document.querySelector('.py-exercise-saved-outdated'));
  w.document.querySelector('.py-exercise-reset').click();
  assert.equal(w.document.querySelector('.py-exercise-saved-outdated'), null);
  assert.equal(w.document.querySelector('.py-exercise-saved-result'), null);
  assert.equal(editors[0].getValue(), exercises()[0].starter);
  assert.equal(calls.changes, 0);
  assert.equal(result(w, 1), '');
  dom.window.close();
});

test('Monaco loader and AMD base use the actual shared resolver on nested CDN/local pages', async () => {
  for (const assetMode of ['cdn', 'local']) {
    const {w,dom,editors}=page(exercises().slice(0,1),{assetMode,pageURL:'https://example.org/course/unit/p.html'});
    const amd=w.require; delete w.require;
    w.qpyodideInstance=Promise.resolve(fakeInterpreter());
    w.eval(sharedSource);
    const loaded=[];
    w.MathExerciseRuntime.loadScript=async url=>{loaded.push(url);w.require=amd;};
    w.eval(componentSource);
    await until(()=>editors.length===1);
    const entry=assetTable.assets['monaco-editor'];
    const base=assetMode==='local' ? 'https://example.org/course/_ctm-assets/'+entry.local.replaceAll('{version}',entry.version) :
      entry.cdn.replaceAll('{version}',entry.version);
    assert.deepEqual(loaded,[base+'min/vs/loader.js']);
    assert.equal(w.monacoVsPath,base+'min/vs');
    assert.ok(/^https:\/\//.test(w.monacoVsPath),'AMD base is absolute');
    if(assetMode==='local')assert.equal(new URL(w.monacoVsPath).origin,w.location.origin);
    dom.window.close();
  }
});

test('local editor and Python failures name the course server, not a CDN', async () => {
  const editor=page(exercises().slice(0,1),{monaco:false,assetMode:'local'});
  editor.w.qpyodideInstance=Promise.resolve(fakeInterpreter());editor.w.eval(source);
  await until(()=>editor.w.document.querySelector('.py-exercise-error'));
  const editorText=editor.w.document.querySelector('.py-exercise-error').textContent;
  assert.match(editorText,/server/);assert.doesNotMatch(editorText,/cdn\.jsdelivr\.net/);
  editor.dom.window.close();
  const python=page(exercises().slice(0,1),{assetMode:'local'});
  python.w.CTMWorker={page:async()=>{throw new Error('Failed to load: https://course.test/site_libs/pyodide-worker-core.js');}};
  python.w.eval(source);await until(()=>python.w.document.querySelector('.py-exercise-check'));
  await tick(20);python.w.document.querySelector('.py-exercise-check').click();
  await until(()=>python.w.document.querySelector('.py-exercise-result .py-exercise-error'));
  const pythonText=python.w.document.querySelector('.py-exercise-result').textContent;
  assert.match(pythonText,/server/);assert.doesNotMatch(pythonText,/cdn\.jsdelivr\.net/);
  python.dom.window.close();
});

test('initial UI barrier waits for actual asynchronous editor construction without waiting for Python', async()=>{
  const {w,dom,editors}=page(exercises(),{monacoDelay:30});
  w.qpyodideInstance=new Promise(()=>{});
  w.eval(source);
  let ready=false;
  const barrier=w.MathExerciseRuntime.whenInitialUIReady().then(()=>{ready=true;});
  await tick(35); assert.equal(editors.length,0,'second AMD callbacks still pending'); assert.equal(ready,false);
  await barrier; assert.equal(editors.length,2); assert.equal(ready,true);
  assert.equal(w.document.querySelectorAll('.py-exercise-check').length,2); dom.window.close();
});

test('initial UI reports per-editor AMD, create and layout failures instead of waiting until deadline',async()=>{
  for(const stage of ['amd','create','layout']) {
    const error=new Error(stage+' failed');
    const {w,dom}=page(exercises().slice(0,1),{editorError:stage==='create'?error:null,secondRequireError:stage==='amd'?error:null});
    w.qpyodideInstance=new Promise(()=>{});
    const errors=[];w.console.error=(...args)=>errors.push(args);
    w.eval(source);
    if(stage==='layout')w.CTMLayout.fitEditor=()=>{throw error;};
    await assert.rejects(w.MathExerciseRuntime.whenInitialUIReady(),e=>e===error);
    assert.match(w.document.querySelector('.py-exercise-error').textContent,/code editor could not be loaded/);
    assert.equal(w.document.querySelector('.py-exercise-check').disabled,true);
    assert.equal(w.document.querySelector('.py-exercise-reset').disabled,true);
    assert.equal(errors.length,1);assert.equal(errors[0][1],error);dom.window.close();
  }
});

test('a deferred script initializes after DOMContentLoaded without waiting for another event',async()=>{
  const {w,dom,editors}=page(exercises());
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  // Deferred dependencies can finish after DOMContentLoaded but still before load.
  Object.defineProperty(w.document,'readyState',{configurable:true,get:()=> 'interactive'});
  w.qpyodideInstance=Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(()=>editors.length===2);
  assert.equal(w.document.querySelectorAll('.py-exercise-check').length,2);
  dom.window.close();
});

test('a failed editor stays local while another exercise can Check without JSXGraph or speech',async()=>{
  const {w,dom,editors}=page(exercises());
  w.qpyodideInstance=Promise.resolve(fakeInterpreter());
  const create=w.monaco.editor.create;
  let first=true;
  w.monaco.editor.create=(...args)=>{
    if(first){first=false;throw new Error('first editor failed');}
    return create(...args);
  };
  w.console.error=()=>{};
  assert.equal(w.JXG,undefined);assert.equal(w.speechSynthesis,undefined);
  w.eval(source);
  await assert.rejects(w.MathExerciseRuntime.whenInitialUIReady(),/first editor failed/);
  await until(()=>editors.length===1);
  const buttons=w.document.querySelectorAll('.py-exercise-check');
  assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);
  buttons[1].click();
  await until(()=>/0 of 1/.test(result(w,2)));
  assert.match(result(w,2),/0 of 1/);
  dom.window.close();
});
