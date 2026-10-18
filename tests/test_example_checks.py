"""Challenge the published examples with correct and plausible wrong programs.

The checks run through the same Python the browser runs: MODULE_PY is read
from _extensions/py-exercise/py-exercise.js, so each
top-level test statement is graded separately in the learner's namespace,
exactly as on the page.
"""
import ast
import base64
import contextlib
import io
import json
import types
from pathlib import Path
import re
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (ROOT / '_extensions/py-exercise/py-exercise.js').read_text(encoding='utf-8')
MESSAGES = {
    'forbidden_import': "Forbidden import: '{}'",
    'forbidden_function': "Forbidden function: '{}'",
    'forbidden_method': "Forbidden method: '.{}'",
    'forbidden_keyword': "Forbidden keyword: '{}'",
    'assertion_failed': 'Assertion failed',
    'test_error': 'Error: {}',
    'syntax_error': 'Syntax error in tests: {}',
}


def browser_python(name):
    """Return a Python snippet embedded in py-exercise.js as an array of JS string lines."""
    body = re.search(r'var ' + name + r" = \[\n(.*?)\n\s*\]\.join\('\\n'\);", RUNTIME, re.S).group(1)
    return '\n'.join(ast.literal_eval(line.strip().rstrip(',')) for line in body.splitlines() if line.strip())


def browser_module():
    """The private module py-exercise.js installs in Pyodide (MODULE_PY)."""
    module = types.ModuleType('_ctm_py_exercise')
    exec(browser_python('MODULE_PY'), module.__dict__)
    return module


MODULE = browser_module()


def check(exercise, learner_code):
    """Return 'blocked', 'error', 'pass' or 'fail' as the page would show it."""
    if exercise['forbidden-imports'] or exercise['forbidden-keywords']:
        if MODULE.violations(learner_code, exercise['forbidden-imports'], exercise['forbidden-keywords'], MESSAGES):
            return 'blocked'
    # Output printed while tests run goes to the page console; keep it out of the test log.
    with contextlib.redirect_stdout(io.StringIO()):
        result = MODULE.run(learner_code, exercise['tests'], MESSAGES)
    if result['student_error']:
        return 'error'
    tests = result['tests']
    return 'pass' if tests and all(test['passed'] for test in tests) else 'fail'


def exercises(path):
    """Parse {py-exercise} blocks like py-exercise.lua (#| options, ## TESTS ## split)."""
    found = {}
    for block in re.findall(r'^```\{py-exercise\}\n(.*?)\n```', (ROOT / path).read_text(encoding='utf-8'), re.S | re.M):
        options, code = {}, []
        for line in block.split('\n'):
            option = re.match(r'^#\|\s*(.*?):\s*(.*?)\s*$', line)
            if option:
                options[option.group(1)] = option.group(2)
            else:
                code.append(line)
        parts = re.split(r'\n[ \t]*##[ \t]*[Tt][Ee][Ss][Tt][Ss][ \t]*##[ \t]*\n', '\n'.join(code), maxsplit=1)
        listed = lambda key: [item.strip() for item in options.get(key, '').split(',') if item.strip()]
        found[options.get('label')] = {
            'starter': parts[0].strip(), 'tests': parts[1].strip() if len(parts) > 1 else '',
            'forbidden-imports': listed('forbidden-imports'), 'forbidden-keywords': listed('forbidden-keywords'),
        }
    return found


def fn(signature, body, before=''):
    return before + 'def ' + signature + ':\n' + textwrap.indent(textwrap.dedent(body).strip(), '    ') + '\n'


PRICE = [
    ('price + tax', fn('price_with_tax(price, rate)', 'tax = price * rate\nreturn price + tax'), 'pass'),
    ('price * (1 + rate)', fn('price_with_tax(price, rate)', 'return price * (1 + rate)'), 'pass'),
    ('tax only', fn('price_with_tax(price, rate)', 'return price * rate'), 'fail'),
    ('rate added to price', fn('price_with_tax(price, rate)', 'return price + rate'), 'fail'),
    ('rate read as percent', fn('price_with_tax(price, rate)', 'return price * (1 + rate / 100)'), 'fail'),
    ('hard-coded 25 %', fn('price_with_tax(price, rate)', 'return price * 1.25'), 'fail'),
]
TOTAL = [
    ('running total', fn('total(values)', 'result = 0\nfor value in values:\n    result += value\nreturn result'), 'pass'),
    ('sum()', fn('total(values)', 'return sum(values)'), 'blocked'),
    ('counts values', fn('total(values)', 'result = 0\nfor value in values:\n    result += 1\nreturn result'), 'fail'),
    ('skips the first value', fn('total(values)', 'result = 0\nfor value in values[1:]:\n    result += value\nreturn result'), 'fail'),
]
NONNEGATIVE = [
    ('generator', fn('total_nonnegative(values)', 'return sum(v for v in values if v >= 0)'), 'pass'),
    ('includes negatives', fn('total_nonnegative(values)', 'return sum(values)'), 'fail'),
    ('absolute values', fn('total_nonnegative(values)', 'return sum(abs(v) for v in values)'), 'fail'),
    ('None for an empty list', fn('total_nonnegative(values)', 'if values:\n    return sum(v for v in values if v >= 0)'), 'fail'),
]
VARIANTS = {
    'price': PRICE,
    'debug-guided': TOTAL, 'debug-worked': TOTAL,
    'review-correctness': NONNEGATIVE, 'review-readability': NONNEGATIVE,
    'add': [
        ('a + b', fn('add(a, b)', 'return a + b'), 'pass'),
        ('float result', fn('add(a, b)', 'return float(a + b)'), 'pass'),
        ('prints instead of returning', fn('add(a, b)', 'print(a + b)'), 'fail'),
        ('hard-coded example', fn('add(a, b)', 'return 3'), 'fail'),
    ],
    'square': [
        ('n ** 2', fn('square(n)', 'return n ** 2'), 'pass'),
        ('pow', fn('square(n)', 'return pow(n, 2)'), 'pass'),
        ('doubling', fn('square(n)', 'return n * 2'), 'fail'),
        ('sign lost', fn('square(n)', 'return abs(n) * n'), 'fail'),
    ],
    'greet': [
        ('print and return', fn('greet(name)', 'message = f"Hello, {name}!"\nprint(message)\nreturn message'), 'pass'),
        ('print with two arguments', fn('greet(name)', 'print("Hello,", name + "!")\nreturn "Hello, " + name + "!"'), 'pass'),
        ('return only', fn('greet(name)', 'return f"Hello, {name}!"'), 'fail'),
        ('print only', fn('greet(name)', 'print(f"Hello, {name}!")'), 'fail'),
        ('prints twice', fn('greet(name)', 's = f"Hello, {name}!"\nprint(s)\nprint(s)\nreturn s'), 'fail'),
    ],
    'circle-area': [
        ('3.14159 * r ** 2', fn('circle_area(r)', 'return 3.14159 * r ** 2'), 'pass'),
        ('named constant', fn('circle_area(r)', 'return PI * r * r', 'PI = 3.14159\n\n'), 'pass'),
        ('math.pi', fn('circle_area(r)', 'return math.pi * r ** 2', 'import math\n\n'), 'blocked'),
        ('circumference', fn('circle_area(r)', 'return 2 * 3.14159 * r'), 'fail'),
        ('diameter squared', fn('circle_area(r)', 'return 3.14159 * (2 * r) ** 2'), 'fail'),
    ],
    'my-sum': [
        ('for loop', fn('my_sum(lst)', 'total = 0\nfor x in lst:\n    total += x\nreturn total'), 'pass'),
        ('recursion', fn('my_sum(lst)', 'return lst[0] + my_sum(lst[1:]) if lst else 0'), 'pass'),
        ('sum()', fn('my_sum(lst)', 'return sum(lst)'), 'blocked'),
        ('skips the last element', fn('my_sum(lst)', 't = 0\nfor i in range(len(lst) - 1):\n    t += lst[i]\nreturn t'), 'fail'),
    ],
    'factorial': [
        ('recursive', fn('factorial(n)', 'if n == 0:\n    return 1\nreturn n * factorial(n - 1)'), 'pass'),
        ('recursive with n <= 1', fn('factorial(n)', 'return 1 if n <= 1 else n * factorial(n - 1)'), 'pass'),
        ('tail recursive', fn('factorial(n, acc=1)', 'return acc if n == 0 else factorial(n - 1, acc * n)'), 'pass'),
        ('memoised recursion', fn('factorial(n)', 'return 1 if n == 0 else n * factorial(n - 1)', 'from functools import lru_cache\n\n@lru_cache\n'), 'pass'),
        ('for loop', fn('factorial(n)', 'r = 1\nfor k in range(2, n + 1):\n    r *= k\nreturn r'), 'blocked'),
        ('math.factorial', fn('factorial(n)', 'return math.factorial(n)', 'import math\n\n'), 'fail'),
        ('product of a range', fn('factorial(n)', 'return math.prod(range(1, n + 1))', 'import math\n\n'), 'fail'),
        ('wrong base case', fn('factorial(n)', 'return 0 if n == 0 else n * factorial(n - 1)'), 'fail'),
    ],
    'palindrome': [
        ('lower and reverse', fn('is_palindrome(s)', 's = s.lower()\nreturn s == s[::-1]'), 'pass'),
        ('two pointers', fn('is_palindrome(s)', 's = s.lower()\ni, j = 0, len(s) - 1\nwhile i < j:\n    if s[i] != s[j]:\n        return False\n    i, j = i + 1, j - 1\nreturn True'), 'pass'),
        ('case-sensitive', fn('is_palindrome(s)', 'return s == s[::-1]'), 'fail'),
        ('first and last letters only', fn('is_palindrome(s)', 's = s.lower()\nreturn s[:1] == s[-1:]'), 'fail'),
    ],
}
PAGES = {
    'example.qmd': {'price'},
    'examples/_feedback-policies.qmd': {'debug-guided', 'debug-worked', 'review-correctness', 'review-readability'},
    'example-en.qmd': {'add', 'square', 'greet', 'circle-area', 'my-sum', 'factorial', 'palindrome'},
    'example-mini.qmd': {'add'},
}
ALREADY_CORRECT = {'review-correctness', 'review-readability'}  # review activities by design


class PublishedExampleChecks(unittest.TestCase):
    def test_every_published_activity_is_covered(self):
        for page, labels in PAGES.items():
            with self.subTest(page=page):
                self.assertEqual(set(exercises(page)), labels)

    def test_starters_behave_as_the_page_describes(self):
        for page in PAGES:
            for label, exercise in exercises(page).items():
                with self.subTest(page=page, label=label):
                    expected = 'pass' if label in ALREADY_CORRECT else 'fail'
                    self.assertEqual(check(exercise, exercise['starter']), expected)

    def test_correct_programs_pass_and_plausible_mistakes_fail(self):
        for page in PAGES:
            for label, exercise in exercises(page).items():
                for name, program, expected in VARIANTS[label]:
                    with self.subTest(page=page, label=label, program=name):
                        self.assertEqual(check(exercise, program), expected)

    def test_setup_statements_do_not_count_as_passed_tests(self):
        # Every top-level statement below ## TESTS ## is reported as one test.
        for page in PAGES:
            for label, exercise in exercises(page).items():
                for statement in ast.parse(exercise['tests']).body:
                    with self.subTest(page=page, label=label, line=statement.lineno):
                        self.assertNotIsInstance(statement, (ast.Import, ast.ImportFrom, ast.Assign, ast.FunctionDef))


class DocumentedExamples(unittest.TestCase):
    def test_documented_starters_are_valid_python(self):
        for doc in ['README.md', *sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs').glob('*.md'))]:
            for label, exercise in exercises(doc).items():
                with self.subTest(doc=doc, label=label):
                    compile(exercise['starter'], label, 'exec')
                    compile(exercise['tests'], label, 'exec')
                    self.assertEqual(check(exercise, exercise['starter']), 'fail')

    def test_documented_decoder_reads_an_exported_submission(self):
        payload = {'v': 1, 'sid': 's123 Øyvind', 'qid': 'quiz-01', 'ts': 't',
                   'results': [{'label': 'add', 'passed': 3, 'total': 3, 'tests': [True, True, True]}]}
        encoded = MODULE.encode(payload, 'demo-key-2026')
        decoder = re.search(r'```python\n(import json, base64.*?)\ndata = ', (ROOT / 'docs/reference.md').read_text(), re.S).group(1)
        script = (ROOT / 'decode.py').read_text().split('\nkey = input(')[0]
        for source in (decoder, script):
            namespace = {}
            exec(source, namespace)
            self.assertEqual(namespace['decode_submission'](encoded, key='demo-key-2026'), payload)
        self.assertNotIn('quiz-01'.encode(), base64.b64decode(encoded))  # XOR-encoded, not plain JSON


if __name__ == '__main__':
    unittest.main()
