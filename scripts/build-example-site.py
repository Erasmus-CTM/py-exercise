"""Render the three standalone teaching pages for GitHub Pages."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
config = root / '_quarto.yml'
if config.exists():
    raise SystemExit('Build in a fresh checkout: an existing _quarto.yml must not be overwritten.')
config.write_text('project:\n  type: default\n  output-dir: _site\n  render: [example.qmd, example-en.qmd, example-mini.qmd]\n')
try:
    subprocess.run(['quarto', 'render'], cwd=root, check=True)
finally:
    config.unlink()
site = root / '_site'
for name in ['example.html', 'example-en.html', 'example-mini.html']:
    if not (site / name).is_file():
        raise SystemExit('Missing rendered page: ' + name)
(site / '.nojekyll').touch()
(site / 'index.html').write_text('''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Python practice for your course</title>
<style>body{font:1.15rem/1.6 system-ui;max-width:48rem;margin:4rem auto;padding:0 1.5rem}a{color:#165caa}li{margin:1rem 0}</style></head>
<body><main><h1>Python practice for your course</h1>
<p>Try a short task, check your work, and compare different kinds of help. Open the source beneath an activity to adapt it for your students.</p>
<ul><li><a href="example.html">Python examples and feedback comparisons</a>: debugging hints, worked corrections and code reviews.</li>
<li><a href="example-en.html">Build a short Python practice session</a>: a larger collection of teaching ideas.</li>
<li><a href="example-mini.html">Your first Python practice task</a>: start with one small function.</li></ul>
<p><a href="https://github.com/Erasmus-CTM/py-exercise">Authoring guides and editable examples</a></p>
</main></body></html>''')
