"""Native driver safety helpers only; these tests do not claim native execution."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_driver',Path(__file__).resolve().parents[1]/'verify-design-native.py')
driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)


class NativeSafetyTests(unittest.TestCase):
    def test_outputs_cannot_overlap_original_project(self):
        source=Path('/private/tmp/source')
        for output in [source,source/'evidence',source.parent]:
            with self.assertRaises(ValueError):driver.validate_output_paths([source],output)
        driver.validate_output_paths([source],Path('/private/tmp/separate-evidence'))

    def test_source_hashes_are_read_only_and_include_non_project_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'project.json').write_text('{}');(root/'notes.txt').write_text('original')
            before=driver.snapshot(root);self.assertEqual(set(before),{'project.json','notes.txt'})
            self.assertEqual(before,driver.snapshot(root));self.assertEqual((root/'notes.txt').read_text(),'original')

    def test_symlink_does_not_materialize_unassigned_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'project.json').write_text('{}');(root/'linked').symlink_to(root/'project.json')
            with self.assertRaises(ValueError):driver.snapshot(root)


if __name__=='__main__':unittest.main()
