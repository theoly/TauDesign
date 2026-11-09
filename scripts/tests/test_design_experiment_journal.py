"""Focused local journal tests: no browser, Provider or user project access."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.design_experiment_journal import exclusive_json, experiment_lock, dispatch_state


class JournalTests(unittest.TestCase):
    def test_no_duplicate_dispatch_after_interruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            plan, run = {'id': 'synthetic'}, {'id': 'r001'}
            with experiment_lock(tmp):
                self.assertEqual(dispatch_state(tmp, plan, run), 'new')
            with experiment_lock(tmp):
                self.assertEqual(dispatch_state(tmp, plan, run), 'interrupted')
                record = Path(tmp)/'runs/r001/record.json'
                data = json.loads(record.read_text())
                self.assertFalse(data['measurementComplete'])
                self.assertEqual(data['status'], 'interrupted')
                before = record.read_bytes()
                self.assertEqual(dispatch_state(tmp, plan, run), 'terminal')
                self.assertEqual(record.read_bytes(), before)

    def test_live_os_lock_prevents_a_second_runner(self):
        with tempfile.TemporaryDirectory() as tmp:
            with experiment_lock(tmp):
                with self.assertRaises(BlockingIOError):
                    with experiment_lock(tmp):
                        self.fail('Concurrent runner acquired live lock')
            with experiment_lock(tmp):
                pass

    def test_terminal_evidence_is_exclusive_and_foreign_identity_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)/'runs/r001/record.json'
            exclusive_json(target, {'id': 'r001', 'planId': 'foreign'})
            with self.assertRaises(FileExistsError):
                exclusive_json(target, {})
            with self.assertRaises(ValueError):
                dispatch_state(tmp, {'id': 'synthetic'}, {'id': 'r001'})

    def test_scrub_handles_escaped_bearer_and_nested_values(self):
        spec = importlib.util.spec_from_file_location('runner', Path(__file__).resolve().parents[1]/'run-design-experiment.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        secret = 'quoted"\\key'
        value = {'authorization': 'never', 'nested': [secret, 'Bearer '+secret], 'number': 2}
        scrubbed = module.scrub(value, {'provider': {'apiKey': 'Bearer '+secret}})
        self.assertNotIn(secret, json.dumps(scrubbed))
        self.assertNotIn('authorization', scrubbed)
        self.assertEqual(scrubbed['number'], 2)
        self.assertEqual(module.fatal_provider_status({'requests':[{'httpStatus':402}]}),402)
        self.assertEqual(module.fatal_provider_status({'requests':[{'httpStatus':429}]}),429)
        self.assertIsNone(module.fatal_provider_status({'requests':[{'httpStatus':500}]}))


if __name__ == '__main__':
    unittest.main()
