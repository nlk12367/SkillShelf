"""Portable discovery tests using temporary fixtures, never installed Skill files."""
import importlib.util
import json
import os
import tempfile
import subprocess
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

BASE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('scanner', BASE / 'scan-skills.py')
scanner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scanner)


class ScannerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.test-scanner-', dir=BASE)
        self.base = Path(self.temp.name)
        if not self.base.resolve().is_relative_to(BASE.resolve()):
            raise RuntimeError('Temporary test root escaped the workspace.')
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {'CODEX_HOME': str(self.base / 'home-codex')})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.config = {'schemaVersion': 1, 'skillRoots': ['./skills'],
                       'pluginCaches': ['./plugins'], 'includeAuxiliary': False}

    def write(self, relative, text):
        file = self.base / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text, encoding='utf-8')
        return file

    def skill(self, relative, name='demo'):
        return self.write(relative, f'---\nname: {name}\ndescription: Example task.\n---\n# Example\nBody.\n')

    def scan(self):
        self.write('skills-config.json', json.dumps(self.config))
        return scanner.scan(verbose=False, base=self.base)

    def plugin(self, version='1.0.0', namespace='example', folder='skills', manifest='.codex-plugin'):
        prefix = f'plugins/market/{namespace}/{version}'
        self.write(prefix + '/' + manifest + '/plugin.json', json.dumps({'name': namespace, 'skills': './' + folder}))
        self.skill(prefix + '/' + folder + '/demo/SKILL.md', 'ExactCase')
        return prefix

    def test_relative_paths_use_tool_folder_not_shell_directory(self):
        expected = self.base / 'skills'
        self.assertEqual(scanner.resolve_source('./skills', self.base), expected.resolve())

    def test_codex_home_override_and_tilde_resolve_for_current_user(self):
        self.assertEqual(scanner.resolve_source('~/.codex/skills'), (self.base / 'home-codex/skills').resolve())
        with patch.dict(os.environ, {'USERPROFILE': str(self.base / 'different-user'), 'HOME': str(self.base / 'different-user')}):
            self.assertEqual(scanner.resolve_source('~/.agents/skills'), (self.base / 'different-user/.agents/skills').resolve())

    def test_rejects_invalid_config(self):
        self.config['skillRoots'] = 'not a list'
        with self.assertRaises(ValueError):
            self.scan()

    def test_multiline_yaml_metadata_and_empty_description(self):
        meta, _ = scanner.metadata('---\nname: Demo\ndescription: >\n  first line\n  second line\n---\nbody')
        self.assertEqual(meta['description'], 'first line second line')
        meta, _ = scanner.metadata('---\nname: Demo\ndescription:\nlicense: MIT\n---\nbody')
        self.assertEqual(meta['description'], '')

    def test_local_skill_deduplicates_configured_physical_paths(self):
        file = self.skill('skills/a/SKILL.md')
        self.config['skillRoots'].append('./skills')
        result = self.scan()
        self.assertEqual(len(result['skills']), 1)
        self.assertEqual(result['skills'][0]['body'], file.read_text(encoding='utf-8'))

    def test_auxiliary_fixtures_can_be_included_explicitly(self):
        self.skill('skills/tests/fixtures/SKILL.md')
        self.assertEqual(self.scan()['skills'], [])
        self.config['includeAuxiliary'] = True
        result = self.scan()
        self.assertEqual(len(result['skills']), 1)
        self.assertTrue(result['skills'][0]['auxiliary'])

    def test_plugin_namespace_case_and_latest_version(self):
        self.plugin('1.9.0')
        self.plugin('1.10.0')
        result = self.scan()
        self.assertEqual(len(result['skills']), 1)
        self.assertEqual(result['skills'][0]['name'], 'example:ExactCase')
        self.assertEqual(result['skills'][0]['version'], '1.10.0')

    def test_claude_plugin_manifest_is_supported(self):
        self.plugin(manifest='.claude-plugin')
        self.assertEqual(self.scan()['skills'][0]['name'], 'example:ExactCase')

    def test_ecc_migrated_commands_are_included(self):
        prefix = self.plugin(namespace='ecc')
        self.skill(prefix + '/.codex-plugin/migrated-command-skills/run/SKILL.md', 'source-command-run')
        self.assertEqual({s['name'] for s in self.scan()['skills']}, {'ecc:ExactCase', 'ecc:source-command-run'})

    def test_plugin_enabled_disabled_unknown_are_distinct(self):
        self.plugin(namespace='enabled')
        self.plugin(namespace='disabled')
        self.plugin(namespace='unknown')
        self.write('home-codex/config.toml', '[plugins."enabled@market"]\nenabled = true\n\n[plugins."disabled@market"]\nenabled = false\n')
        states = {s['plugin']: s['status'] for s in self.scan()['skills']}
        self.assertEqual(states, {'enabled': 'enabled', 'disabled': 'disabled', 'unknown': 'unknown'})

    def test_stable_ids_survive_plugin_version_updates(self):
        self.plugin('1.0.0')
        first = self.scan()['skills'][0]['id']
        self.plugin('2.0.0')
        self.assertEqual(self.scan()['skills'][0]['id'], first)

    def test_missing_roots_are_reported(self):
        result = self.scan()
        self.assertFalse(result['diagnostics'][0]['exists'])
        self.assertEqual(len(result['skills']), 0)

    def test_unreadable_utf8_is_reported_without_dropping_other_skills(self):
        self.skill('skills/valid/SKILL.md')
        broken = self.write('skills/broken/SKILL.md', '')
        broken.write_bytes(b'\xff\xfe\xff')
        result = self.scan()
        self.assertEqual(len(result['skills']), 1)
        self.assertEqual(len(result['readErrors']), 1)

    def test_plugin_manifest_cannot_read_outside_its_root(self):
        prefix = self.plugin()
        self.write(prefix + '/.codex-plugin/plugin.json', json.dumps({'name': 'example', 'skills': '../../../../outside'}))
        self.skill('skills/valid/SKILL.md', 'valid')
        result = self.scan()
        self.assertEqual([s['name'] for s in result['skills']], ['valid'])
        self.assertTrue(any(d.get('code') == 'plugin-invalid' for d in result['diagnostics']))

    def test_bad_plugins_do_not_block_valid_plugins(self):
        self.plugin(namespace='valid')
        for i, manifest in enumerate(['{broken', '[]', '{"name": null}', '{"skills": 12}', '{"skills": [false]}']):
            prefix = self.plugin(namespace=f'broken{i}')
            self.write(prefix + '/.codex-plugin/plugin.json', manifest)
        result = self.scan()
        self.assertEqual([s['name'] for s in result['skills']], ['valid:ExactCase'])
        self.assertEqual(sum(d.get('code') == 'plugin-invalid' for d in result['diagnostics']), 5)

    def test_oversized_file_is_not_read_in_full(self):
        self.config['scanLimits'] = {'maxSkillBytes': 1024}
        self.write('skills/huge/SKILL.md', 'x' * 4096)
        self.skill('skills/valid/SKILL.md', 'valid')
        result = self.scan()
        self.assertEqual([s['name'] for s in result['skills']], ['valid'])
        self.assertEqual(len(result['readErrors']), 1)

    def test_depth_and_excluded_directories_are_pruned(self):
        self.config.update(scanLimits={'maxDepth': 1}, excludeDirectories=['vendor'])
        self.skill('skills/shallow/SKILL.md', 'shallow')
        self.skill('skills/deep/nested/SKILL.md', 'deep')
        self.skill('skills/vendor/nested/SKILL.md', 'vendor')
        result = self.scan()
        self.assertEqual([s['name'] for s in result['skills']], ['shallow'])
        self.assertTrue(any(d.get('code') == 'depth-limit' for d in result['diagnostics']))
        self.assertFalse(any('vendor' in d['label'] for d in result['diagnostics']))

    def test_global_file_entry_and_byte_budgets(self):
        for i in range(10):
            self.skill(f'skills/{i}/SKILL.md', f'skill{i}')
        self.config['scanLimits'] = {'maxFiles': 2}
        self.assertEqual(len(self.scan()['skills']), 2)
        self.config['scanLimits'] = {'maxEntries': 3}
        result = self.scan()
        self.assertLessEqual(result['scanStats']['entries'], 3)
        self.assertTrue(any(d.get('code') == 'entry-limit' for d in result['diagnostics']))
        self.config['scanLimits'] = {'maxTotalBytes': 100}
        self.assertLessEqual(self.scan()['scanStats']['bytesRead'], 100)

    def test_invalid_limit_types_fail_before_scanning(self):
        for limits in ({'maxFiles': True}, {'maxSkillBytes': 0}, {'maxDepth': -1}, {'unknown': 1}):
            self.config['scanLimits'] = limits
            with self.assertRaises(ValueError):
                self.scan()

    def test_atomic_staging_failure_preserves_all_old_outputs(self):
        first = self.write('skills-index.json', '{"old": true}')
        second = self.write('Skills查詢工具.html', 'old html')
        with patch.object(scanner.os, 'fsync', side_effect=[None, OSError('disk full')]):
            with self.assertRaises(OSError):
                scanner.atomic_outputs([(first, '{"new": true}'), (second, 'new html')])
        self.assertEqual(json.loads(first.read_text()), {'old': True})
        self.assertEqual(second.read_text(), 'old html')
        self.assertEqual(list(self.base.glob('.*.tmp')), [])

    def test_process_killed_before_replace_preserves_old_catalog(self):
        target = self.write('skills-index.json', '{"old": true}')
        marker = self.base / 'staged'
        code = '''import importlib.util, sys, time
from pathlib import Path
spec = importlib.util.spec_from_file_location('scanner', sys.argv[1])
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)
def pause(*args):
    Path(sys.argv[3]).write_text('ready')
    time.sleep(30)
scanner.os.replace = pause
scanner.atomic_outputs([(Path(sys.argv[2]), '{"new": true}')])
'''
        process = subprocess.Popen([sys.executable, '-c', code, str(BASE / 'scan-skills.py'),
                                    str(target), str(marker)])
        try:
            deadline = time.monotonic() + 5
            while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(marker.exists(), 'Child did not reach staged-write checkpoint')
        finally:
            process.kill()
            process.wait(timeout=5)
        self.assertEqual(json.loads(target.read_text()), {'old': True})

    def test_atomic_replace_failure_keeps_valid_old_file(self):
        target = self.write('skills-index.json', '{"old": true}')
        with patch.object(scanner.os, 'replace', side_effect=PermissionError('locked')):
            with self.assertRaises(PermissionError):
                scanner.atomic_outputs([(target, '{"new": true}')])
        self.assertEqual(json.loads(target.read_text()), {'old': True})
        scanner.atomic_outputs([(target, '{"new": true}')])
        self.assertEqual(json.loads(target.read_text()), {'new': True})
        self.assertEqual(list(self.base.glob('.*.tmp')), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
