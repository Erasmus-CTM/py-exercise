import unittest
import test_example_checks as harness

class WorkerOutput(unittest.TestCase):
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
