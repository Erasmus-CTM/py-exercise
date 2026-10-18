"""Learner code checked by py-exercise cannot change the interpreter for the
other components on the page (the shared _ctm_guard from pyodide-runtime.js)."""
import builtins
import io
import re
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))
import test_example_checks as harness  # noqa: E402


def guard_source():
    runtime = (ROOT / '_extensions/py-exercise/shared/pyodide-runtime.js').read_text(encoding='utf-8')
    body = re.search(r"var GUARD_PY = \[\n(.*?)\n\s*\]\.join\('\\n'\);", runtime, re.S).group(1)
    return '\n'.join(eval(line.strip().rstrip(',')) for line in body.splitlines() if line.strip())


class Isolation(unittest.TestCase):
    def setUp(self):
        guard = types.ModuleType('_ctm_guard')
        exec(guard_source(), guard.__dict__)
        sys.modules['_ctm_guard'] = guard
        self.module = types.ModuleType('_ctm_py_exercise')
        exec(harness.browser_python('MODULE_PY'), self.module.__dict__)
        sys.modules['_ctm_other_component'] = self.other = types.ModuleType('_ctm_other_component')

    def tearDown(self):
        for name in ('_ctm_guard', '_ctm_other_component'):
            sys.modules.pop(name, None)

    def test_learner_code_cannot_change_shared_interpreter_state(self):
        stdout, limit, length = sys.stdout, sys.getrecursionlimit(), len
        code = '\n'.join([
            'import builtins, sys',
            'builtins.len = lambda x: 0',
            'builtins.extra = 1',
            'sys.setrecursionlimit(100)',
            'sys.stdout = None',
            'del sys.modules["_ctm_other_component"]',
            'def add(a, b):',
            '    return a + b',
        ])
        result = self.module.run(code, 'assert add(1, 2) == 3', harness.MESSAGES)
        self.assertEqual(result['tests'], [{'passed': True}])
        self.assertIs(builtins.len, length)
        self.assertFalse(hasattr(builtins, 'extra'))
        self.assertIs(sys.stdout, stdout)
        self.assertEqual(sys.getrecursionlimit(), limit)
        self.assertIs(sys.modules['_ctm_other_component'], self.other)

    def test_a_failing_restore_step_does_not_stop_the_others(self):
        path, limit = sys.path, sys.getrecursionlimit()
        code = 'import sys\nsys.path = "/tmp"\nsys.setrecursionlimit(100)\ndel sys.modules["_ctm_other_component"]'
        self.module.run(code, 'assert True', harness.MESSAGES)
        self.assertIs(sys.path, path)
        self.assertEqual(sys.getrecursionlimit(), limit)
        self.assertIs(sys.modules['_ctm_other_component'], self.other)

    def test_every_check_starts_from_a_fresh_namespace(self):
        self.module.run('leftover = 1\ndef add(a, b):\n    return a + b', 'assert add(1, 2) == 3', harness.MESSAGES)
        result = self.module.run('def add(a, b):\n    return leftover', 'assert add(1, 2) == 3', harness.MESSAGES)
        self.assertFalse(result['tests'][0]['passed'])
        self.assertIn('leftover', result['tests'][0]['message'])

    def test_main_blocks_do_not_run_during_a_check(self):
        code = 'def add(a, b):\n    return a + b\nif __name__ == "__main__":\n    input("number: ")'
        result = self.module.run(code, 'assert add(1, 2) == 3', harness.MESSAGES)
        self.assertIsNone(result['student_error'])
        self.assertEqual(result['tests'], [{'passed': True}])

    def test_exit_in_learner_code_or_tests_is_reported_not_raised(self):
        result = self.module.run('import sys\nsys.exit(3)', 'assert True', harness.MESSAGES)
        self.assertIn('SystemExit', result['student_error'])
        result = self.module.run('pass', 'raise SystemExit(1)', harness.MESSAGES)
        self.assertFalse(result['tests'][0]['passed'])


if __name__ == '__main__':
    unittest.main()
