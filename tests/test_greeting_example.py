"""The published task must test both its stated output and return value."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class GreetingExampleTests(unittest.TestCase):
    def test_authored_checks_enforce_both_requirements(self):
        block = next(block for block in re.findall(r'```\{py-exercise\}\n(.*?)\n```', (ROOT/'example-en.qmd').read_text(), re.S)
                     if '#| label: greet\n' in block)
        checks = block.split('## TESTS ##', 1)[1]
        implementations = [
            ('correct', 'message = f"Hello, {name}!"\n    print(message)\n    return message', True),
            ('silent', 'return f"Hello, {name}!"', False),
            ('print only', 'print(f"Hello, {name}!")', False),
            ('duplicate output', 'print(f"Hello, {name}!")\n    print(f"Hello, {name}!")\n    return f"Hello, {name}!"', False),
        ]
        for name, body, expected in implementations:
            with self.subTest(name=name):
                namespace = {}
                exec('def greet(name):\n    ' + body, namespace)
                try:
                    exec(checks, namespace)
                    passed = True
                except AssertionError:
                    passed = False
                self.assertEqual(passed, expected)


if __name__ == '__main__':
    unittest.main()
