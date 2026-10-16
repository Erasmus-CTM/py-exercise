#!/usr/bin/env python3
"""Read explicit dependency refs from a review commit; main always uses defaults."""
import json
import os
import re
import subprocess

refs = {}
if os.environ.get('GITHUB_REF') != 'refs/heads/main':
    commit = os.environ.get('REVIEW_COMMIT') or 'HEAD'
    message = subprocess.check_output(['git', 'log', '-1', '--format=%B', commit], text=True)
    trailers = [line.removeprefix('CTM-Review-Refs: ') for line in message.splitlines() if line.startswith('CTM-Review-Refs: ')]
    if len(trailers) > 1:
        raise SystemExit('Use one CTM-Review-Refs trailer')
    if trailers:
        refs = json.loads(trailers[0])
        allowed = {'ai-feedback','math-exercise','py-exercise','pyodide-interaktiv','ctm-assessment'}
        if not isinstance(refs, dict) or any(name not in allowed or not isinstance(ref, str) or not re.fullmatch(r'[0-9a-f]{40}', ref) for name, ref in refs.items()):
            raise SystemExit('Review refs must map known dependencies to full commit SHAs')
print('Explicit review dependencies: ' + json.dumps(refs, sort_keys=True))
with open(os.environ['GITHUB_ENV'], 'a') as env:
    env.write('CTM_REVIEW_REFS=' + json.dumps(refs) + '\n')
with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
    for name, ref in refs.items():
        output.write(name + '=' + ref + '\n')
