#!/usr/bin/env python3
"""Restart EchoIQ review decisions, preserving prepared work and backups."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
from datetime import datetime, timezone

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', required=True, type=Path, help='Review workspace to reset')
root = parser.parse_args().root.expanduser().resolve()
spec = importlib.util.spec_from_file_location('review', Path(__file__).resolve().parents[2] / 'lib/company/review.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
review.ROOT = root

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(root / repo), *args], text=True).strip()

with review.locked():
    plan = json.loads((root / '.review/plan.json').read_text())
    state = review.read_state()
    if state.get('pending'):
        raise SystemExit('An acceptance is pending; recover it before resetting.')
    # A previously reset state can have lost its acceptance entries while the
    # refs and accepted record still agree. Verify that recorded commit chain
    # rather than treating those known acceptances as unrelated branch changes.
    accepted = review.document_path('master')
    record = accepted.read_text() if accepted.exists() else ''
    recorded_heads = {repo: metadata['base'] for repo, metadata in plan['repositories'].items()}
    for repo, section in re.findall(r'^#### ([^\n]+)\n(.*?)(?=^#### |^<!-- accepted:|\Z)', record, re.M | re.S):
        commit = re.search(r'Commit: `([0-9a-f]{40})`\. Review base: `([0-9a-f]{40})`', section)
        if not commit or repo not in recorded_heads:
            raise SystemExit('The accepted record has an unrecognized commit; reset stopped.')
        head, parent = commit.groups()
        if recorded_heads[repo] != parent or git(repo, 'rev-parse', head + '^') != parent:
            raise SystemExit(f'{repo}: the accepted record does not form the expected history; reset stopped.')
        recorded_heads[repo] = head
    moves = []
    for repo, metadata in plan['repositories'].items():
        expected = metadata['base']
        for round_ in plan['rounds']:
            entry = state['rounds'].get(round_['id'], {})
            if entry.get('status') == 'accepted':
                expected = entry.get('accepted_commits', {}).get(repo, expected)
        head = git(repo, 'rev-parse', 'master')
        if head not in (expected, recorded_heads[repo]):
            raise SystemExit(f'{repo}: master has unrecorded changes; reset stopped.')
        if head != metadata['base']:
            if 'branch refs/heads/master\n' in git(repo, 'worktree', 'list', '--porcelain') + '\n':
                raise SystemExit(f'{repo}: switch away from master before resetting.')
            moves.append((repo, head, metadata['base']))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = root / '.review' / ('restart-backup-' + stamp)
    backup.mkdir()
    paths = [review.state_path(), review.document_path('board'), review.document_path('master')]
    for path in paths:
        if path.exists():
            shutil.copy2(path, backup / path.name)
    for repo, head, base in moves:
        git(repo, 'update-ref', f'refs/heads/review-backup/{stamp}', head)
    for repo, head, base in moves:
        git(repo, 'update-ref', 'refs/heads/master', base, head)
    fresh = {**state, 'rounds': {
        round_id: {key: value for key, value in entry.items() if key in ('comments', 'drafts', 'copy')}
        for round_id, entry in state['rounds'].items()
        if any(key in entry for key in ('comments', 'drafts', 'copy'))
    }, 'active': False}
    review.save(review.state_path(), fresh)
    text = accepted.read_text() if accepted.exists() else "# Accepted rounds\n"
    text = text.replace('No rounds have been accepted yet. Run `./review start` to begin or resume.\n', '')
    accepted.write_text(text.split('<!-- accepted:', 1)[0].rstrip() + '\n\nNo rounds have been accepted yet. Run `./review start` to begin or resume.\n')
    review.board(plan, fresh)
    view = review.snapshot(plan, review.read_state())
    assert all(r['status'] == 'prepared' for r in view['rounds'])
    assert view['round']['id'] == plan['rounds'][0]['id']
    print(f"Reset complete: 0/{len(view['rounds'])} rounds accepted; next round {view['round']['id']}.")
    print(f'Previous decisions and documents: {backup}')
    print('Refresh THWH to load the reset state. Prepared commits and patches are preserved.')
