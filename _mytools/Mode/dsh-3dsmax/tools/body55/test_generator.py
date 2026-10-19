"""Check unsafe profile and output rejection without requiring 3ds Max."""

import copy
import json
from pathlib import Path
import tempfile
import unittest

from generate import generate, validate


class Body55InputTests(unittest.TestCase):
    def setUp(self):
        self.profile = json.loads(Path(__file__).with_name('profiles').joinpath('chiya.json').read_text())

    def test_measured_chiya_profile_is_accepted(self):
        validate(self.profile)

    def test_invalid_profiles_fail_before_script_generation(self):
        cases = []
        missing = copy.deepcopy(self.profile)
        missing['nodes'].pop()
        cases.append((missing, '55 node'))
        duplicate = copy.deepcopy(self.profile)
        duplicate['nodes'][1]['name'] = 'Root'
        cases.append((duplicate, 'canonical'))
        parent = copy.deepcopy(self.profile)
        parent['nodes'][1]['parent'] = 'head'
        cases.append((parent, 'parent'))
        nonfinite = copy.deepcopy(self.profile)
        nonfinite['nodes'][0]['position'][0] = float('nan')
        cases.append((nonfinite, 'finite'))
        scaled = copy.deepcopy(self.profile)
        scaled['nodes'][0]['axes'][0][0] = 2
        cases.append((scaled, 'orthonormal'))
        reflected = copy.deepcopy(self.profile)
        reflected['nodes'][0]['axes'][0][0] = -1
        cases.append((reflected, 'right-handed'))
        wrong_axis = copy.deepcopy(self.profile)
        arm = next(n for n in wrong_axis['nodes'] if n['name'] == 'upperarm_l')
        arm['axes'][0], arm['axes'][1] = arm['axes'][1], [-q for q in arm['axes'][0]]
        cases.append((wrong_axis, 'local \\+X'))
        mesh_collision = copy.deepcopy(self.profile)
        mesh_collision['meshes'][0]['name'] = 'root'
        cases.append((mesh_collision, 'collide'))
        for profile, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                validate(profile)

    def test_existing_or_source_scene_cannot_be_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'source.max'
            source.write_bytes(b'fixture')
            with self.assertRaisesRegex(ValueError, 'differ'):
                generate(self.profile, source, source)
            output = Path(directory)/'existing.max'
            output.write_bytes(b'preserve')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                generate(self.profile, source, output)
            self.assertEqual(output.read_bytes(), b'preserve')

    def test_rendered_script_loads_with_read_only_actions(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'input 场景.max'
            source.write_bytes(b'fixture')
            result = generate(self.profile, source, Path(directory)/'new.max')
            self.assertNotIn('@@', result)
            self.assertTrue(result.endswith('then DSHBody55Run action:#verify else DSHBody55Run action:#preflight\n'))
            self.assertIn('input 场景.max', result)


if __name__ == '__main__':
    unittest.main()
