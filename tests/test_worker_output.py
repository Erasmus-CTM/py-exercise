import unittest
import sys
import types
from unittest.mock import patch
import test_example_checks as harness

class WorkerOutput(unittest.TestCase):
    def test_plot_cleanup_failure_still_restores_stdout_and_shared_guard(self):
        module = harness.browser_module()
        restored = []
        module._ctm_guard = types.SimpleNamespace(snapshot=lambda: {}, restore=lambda state: restored.append(True))
        def fail():
            raise RuntimeError('plot cleanup failed')
        module._plots_begin = lambda *args: fail
        stdout = sys.stdout
        with self.assertRaisesRegex(RuntimeError, 'plot cleanup failed'):
            module.run('print("answer")', 'assert True', harness.MESSAGES)
        self.assertIs(sys.stdout, stdout)
        self.assertEqual(restored, [True])

    def test_private_plot_does_not_publish_an_image_or_fail_an_authored_test(self):
        module = harness.browser_module()
        plt = types.ModuleType('matplotlib.pyplot')
        plt.show = lambda: None
        plt.switch_backend = lambda name: None
        plt.get_fignums = lambda: [1]
        plt.figure = lambda number: object()
        plt.close = lambda *args: None
        figure = types.ModuleType('matplotlib.figure')
        figure.Figure = type('Figure', (), {'show':lambda self:None})
        matplotlib = types.ModuleType('matplotlib')
        matplotlib.pyplot = plt
        matplotlib.figure = figure
        with patch.dict(sys.modules, {'matplotlib':matplotlib,'matplotlib.pyplot':plt,'matplotlib.figure':figure}):
            result = module.run('pass', 'import matplotlib.pyplot as plt\nplt.show()\nassert True', harness.MESSAGES)
        self.assertEqual(result['tests'], [{'passed':True}] * 3)
        self.assertNotIn('images', result)

    def test_stream_contains_learner_output_only(self):
        module = harness.browser_module()
        stream, phases = [], []
        module._stream_callback = stream.append
        module._phase_callback = phases.append
        result = module.run('print("learner")', 'print("TEACHER_ONLY")\nassert True', harness.MESSAGES)
        self.assertEqual(result['stdout'], 'learner\n')
        self.assertEqual(''.join(stream), 'learner\n')
        self.assertEqual(result['tests'], [{'passed': True}, {'passed': True}])
        self.assertEqual(phases, ['learner', 'private', 'private'])

    def test_capture_limit_is_infrastructure_failure_without_a_grade(self):
        module = harness.browser_module()
        with self.assertRaises(module._CTMOutputLimit):
            module.run('print("x" * 262145)', 'assert False', harness.MESSAGES)

    def test_test_capture_cannot_change_the_learner_stdout_snapshot(self):
        module = harness.browser_module()
        result = module.run('print("answer")', 'print("secret")\nassert True', harness.MESSAGES)
        self.assertEqual(result['stdout'], 'answer\n')
        self.assertEqual(result['tests'], [{'passed': True}, {'passed': True}])
