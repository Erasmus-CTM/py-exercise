// Rendering with and without the optional extensions (needs Quarto; skipped otherwise).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const quarto = process.env.QUARTO_BIN || 'quarto';
const skip = spawnSync(quarto, ['--version']).error ? 'Quarto required' : false;
const feedback = process.env.AI_FEEDBACK_EXTENSION;
const exercise = '```{py-exercise}\n#| task: Return two.\ndef answer():\n    return 0\n## TESTS ##\nassert answer() == 2\n```\n';

function render(front, body, { withFeedback = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-exercise-render-'));
  fs.cpSync(path.join(__dirname, '../_extensions/py-exercise'), path.join(dir, '_extensions/py-exercise'), { recursive: true });
  if (withFeedback) fs.cpSync(feedback, path.join(dir, '_extensions/ai-feedback'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.qmd'), '---\nformat: html\nfilters: [py-exercise]\n' + front + '---\n\n' + body);
  const r = spawnSync(quarto, ['render', 'page.qmd'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  const html = fs.existsSync(path.join(dir, 'page.html')) ? fs.readFileSync(path.join(dir, 'page.html'), 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...r, html };
}

test('without ai-feedback and with feedback off nothing of ai-feedback is loaded', { skip }, () => {
  const r = render('', exercise);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.html, /py-exercise-cell/);
  assert.doesNotMatch(r.html, /feedback-core\.js|py-exercise-feedback/);
});

test('a page that uses a missing extension stops with the install command', { skip }, () => {
  let r = render('py-exercise:\n  feedback: true\n', exercise);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /quarto add Erasmus-CTM\/ai-feedback/);
  r = render('', exercise + '\n::: {.ai-feedback}\nExplain.\n:::\n');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /uses AI feedback activities .* not installed\. Run: quarto add Erasmus-CTM\/ai-feedback/);
  r = render('', exercise + '\n```{.jsxgraph}\nvar b = 1;\n```\n');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Run: quarto add jsxgraph\/jsxgraph-quarto/);
});

test('feedback needs the task; text activities are prepared even with exercise feedback off', { skip: skip || (!feedback && 'AI_FEEDBACK_EXTENSION not set') }, () => {
  let r = render('py-exercise:\n  feedback: true\n', exercise.replace('#| task: Return two.\n', ''), { withFeedback: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /shared feedback requires #\| task:/);
  r = render('', exercise + '\n::: {.ai-feedback}\nExplain.\n:::\n', { withFeedback: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.html, /ai-feedback-activity/);
  assert.doesNotMatch(r.html, /py-exercise-feedback/);
});

test('with exercise feedback off, hidden callouts stay out of an activity context', { skip: skip || (!feedback && 'AI_FEEDBACK_EXTENSION not set') }, () => {
  const body = '::: {.callout-tip .ai-feedback-ignore}\nSECRET SOLUTION 42\n:::\n\n::: {.ai-feedback}\nExplain.\n:::\n';
  const r = render('', exercise + '\n' + body, { withFeedback: true });
  assert.equal(r.status, 0, r.stderr);
  const data = [...r.html.matchAll(/class="ai-feedback-data"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  assert.ok(data.length > 0, 'activity data present');
  assert.doesNotMatch(data, /SECRET SOLUTION/);
});
