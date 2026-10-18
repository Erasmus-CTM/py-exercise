// Browser-runtime regressions for py-exercise.js, run in jsdom against a fake
// shared Python interpreter (no CDN): checks pressed before Python is ready,
// a runtime replaced by pyodide-interaktiv, an unreachable editor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// As the filter injects them: the shared runtime, then the exercise script.
const source = ['shared/pyodide-runtime.js', 'py-exercise.js']
  .map(file => fs.readFileSync(path.join(__dirname, '../_extensions/py-exercise', file), 'utf8')).join('\n');
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

function page(exercises, { monaco = true, monacoDelay = 0 } = {}) {
  const cells = exercises.map(e => '<div class="py-exercise-cell" id="py-exercise-' + e.id + '"></div>').join('');
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + cells + '</body></html>', { url: 'https://example.org/p.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.__pyExerciseConfig = { submission: false, lang: 'en' };
  w.__pyExercises = exercises;
  w.require = (deps, ok, fail) => setTimeout(() => (monaco ? ok() : fail(new Error('offline'))), monacoDelay);
  w.require.config = () => {};
  // Monaco's addCommand is a global keybinding: the last registration wins.
  const keys = {}, editors = [];
  w.monaco = { KeyMod: { Shift: 1 }, KeyCode: { Enter: 2 }, editor: { create: (el, options) => {
    let value = options.value, focus = () => {};
    const editor = { getValue: () => value, setValue: v => { value = v; }, getContentHeight: () => 100, layout() {},
      onDidContentSizeChange() {}, onDidChangeModelContent() {}, onDidFocusEditorText(fn) { focus = fn; },
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
  const { w, dom } = page(exercises().slice(0, 1), { monacoDelay: 61000 });
  w.qpyodideInstance = Promise.resolve(fakeInterpreter());
  w.eval(source);
  await until(() => w.document.querySelector('.py-exercise-error'), 62000);
  await until(() => w.document.querySelector('.py-exercise-check'), 5000);
  assert.equal(w.document.querySelector('.py-exercise-error'), null);
  dom.window.close();
});

test('Python that never finishes loading reports a message and a later Check retries', async () => {
  const { w, dom } = page(exercises().slice(0, 1));
  let loads = 0;
  w.__qExercisePyodideTimeout = 100;
  w.loadPyodide = () => (++loads === 1 ? new Promise(() => {}) : Promise.resolve(fakeInterpreter()));
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
  new w.MutationObserver(() => { offered = offered || !!w.document.querySelector('.py-exercise-stop'); })
    .observe(w.document.body, { childList: true, subtree: true });
  w.document.querySelector('.py-exercise-check').click();
  await until(() => /passed|✓|1\/1/i.test(result(w, 1)) && !w.document.querySelector('.py-exercise-running'));
  assert.equal(offered, false);
  dom.window.close();
});

test('a Stop from another component is reported as stopped, and queued checks then run', async () => {
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
  // The running check reports the stop; the one queued behind it then runs normally.
  await until(() => /Stopped/.test(result(w, 1)) && /0 of 1|passed/.test(result(w, 2)));
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
