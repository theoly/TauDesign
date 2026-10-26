"""Run with the optional visual-regression Python environment; never starts a browser."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image

spec=importlib.util.spec_from_file_location('project_replay',Path(__file__).parents[1]/'verify-project-replay.py')
replay=importlib.util.module_from_spec(spec);spec.loader.exec_module(replay)
spec=importlib.util.spec_from_file_location('compare_visual',Path(__file__).parents[1]/'compare-visual.py')
visual=importlib.util.module_from_spec(spec);spec.loader.exec_module(visual)

class ProjectReplayTests(unittest.TestCase):
    def test_paths_are_read_write_boundary(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            self.assertEqual(replay.safe_file(root,'screens/page.html'),root.resolve()/'screens/page.html')
            for path in ('../outside','/etc/passwd','screens/../project.json','', './project.json'):
                with self.subTest(path=path),self.assertRaises(ValueError):replay.safe_file(root,path)
            (root/'link').symlink_to('/tmp')
            with self.assertRaises(ValueError):replay.safe_file(root,'link/outside')

    def test_real_inputs_are_readonly_and_unregistered_fonts_part_of_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'screens').mkdir();(root/'assets/imports/fonts').mkdir(parents=True)
            (root/'project.json').write_text(json.dumps({'screens':{'page':{}},'assets':{}}));(root.resolve()/'screens/page.html').write_text('<main>资料</main>')
            (root/'assets/imports/fonts/font.woff2').write_bytes(b'original')
            before=replay.source_snapshot(root)
            self.assertEqual(before,replay.source_snapshot(root));self.assertEqual(len(before),3)
            (root/'assets/imports/fonts/font.woff2').write_bytes(b'changed')
            self.assertNotEqual(before,replay.source_snapshot(root))
            (root.resolve()/'screens/page.html').unlink()
            with self.assertRaises(FileNotFoundError):replay.source_snapshot(root)

    def test_environment_device_source_changes_never_reuse_baseline(self):
        identity=replay.baseline_identity({'browser':'webkit','version':'26','platform':'Darwin'},'source','page',{'width':390,'height':844})
        replay.assert_baseline_identity(identity,copy.deepcopy(identity))
        for mutation in ('browser','version','platform','source','screenId','height'):
            other=copy.deepcopy(identity)
            if mutation in ('browser','version','platform'):other['environment'][mutation]='changed'
            elif mutation=='height':other['viewport']['height']=694
            else:other[mutation]='changed'
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):replay.assert_baseline_identity(identity,other)

    def test_png_blank_size_and_deliberate_pixel_drift(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);baseline=root/'reference.png';actual=root/'actual.png';diff=root/'diff.png'
            image=Image.new('RGB',(100,100),'white');image.save(baseline)
            with self.assertRaises(ValueError):replay.png_health(baseline,(100,100))
            with self.assertRaises(ValueError):replay.png_health(baseline,(99,100))
            for x in range(30):
                for y in range(100):image.putpixel((x,y),(250,60,40))
            image.save(actual)
            self.assertLess(replay.png_health(actual,(100,100))['dominantColorRatio'],.995)
            metrics=visual.compare(baseline,actual,diff,12)
            self.assertEqual(metrics['changed_pixel_ratio'],.3);self.assertTrue(diff.exists())
            image.save(baseline)
            self.assertEqual(visual.compare(baseline,actual,diff,12)['changed_pixel_ratio'],0)

if __name__=='__main__':unittest.main()
