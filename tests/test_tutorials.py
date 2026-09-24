"""Public tutorial metadata and writer tests; never load a credential inventory."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('writer', ROOT / 'scripts/add-tutorial.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)

class Tutorials(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.target = Path(self.temp.name) / 'tutorials.yaml'
        self.target.write_text('tutorials: []\n')
        writer.TUTORIALS = self.target
        self.entries = yaml.safe_load((ROOT / 'data/tutorials.yaml').read_text())['tutorials']
        self.entry = copy.deepcopy(next(t for t in self.entries if t['id'] == 'supabase-access'))

    def run_writer(self, entry, check=True):
        args, stdin = sys.argv, sys.stdin
        sys.argv = ['add-tutorial.py', '-'] + (['--check'] if check else [])
        sys.stdin = io.StringIO(json.dumps(entry))
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                code = writer.main()
            return code, output.getvalue()
        finally:
            sys.argv, sys.stdin = args, stdin

    def test_updated_guides_validate(self):
        for entry in self.entries:
            if entry.get('verification_status') == 'docs-reviewed':
                self.assertEqual(self.run_writer(entry)[0], 0, entry['id'])

    def test_invalid_metadata_and_nested_secret_are_rejected(self):
        for field, value in [('last_verified', '2026-02-30'), ('human_steps', 'not a list'),
                             ('verification_status', 'probably'), ('links', [{'label':'bad','url':'javascript:alert(1)'}]),
                             ('troubleshooting', ['ghp_' + 'A' * 36]),
                             ('environment_variables', ['sk_test_' + 'A' * 36]),
                             ('links', [{'label':'docs','url':'https://example.com/?key=sb_secret_' + 'A' * 36}])]:
            entry = {**self.entry, field:value}
            code, output = self.run_writer(entry)
            self.assertEqual(code, 1, field)
            self.assertNotIn('A' * 36, output)
        self.assertEqual(self.target.read_text(), 'tutorials: []\n')

    def test_append_preserves_string_date_and_optional_fields(self):
        self.entry['title'] = 'Setup: an example'
        self.assertEqual(self.run_writer(self.entry, check=False)[0], 0)
        parsed = yaml.safe_load(self.target.read_text())['tutorials']
        self.assertEqual(parsed, [self.entry])
        self.assertEqual(self.run_writer(self.entry)[0], 1) # duplicate ID

    def test_generated_index_matches_public_tutorials(self):
        index = json.loads((ROOT / 'data/tutorial-index.json').read_text())
        self.assertEqual([t['id'] for t in self.entries], [t['id'] for t in index['tutorials']])
        self.assertEqual(len(set(t['id'] for t in self.entries)), len(self.entries))
        for entry in self.entries:
            if entry.get('last_verified'):
                self.assertIsInstance(entry['last_verified'], str)

if __name__ == '__main__':
    unittest.main()
