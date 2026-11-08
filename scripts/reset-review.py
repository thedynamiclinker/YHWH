#!/usr/bin/env python3
"""Restart prepared review decisions, preserving prepared work and backups."""
import fcntl
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

root = Path.cwd()
spec = importlib.util.spec_from_file_location('review', Path(__file__).resolve().parents[1] / 'src/review.py')
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
    moves = []
    for repo, metadata in plan['repositories'].items():
        expected = metadata['base']
        for round_ in plan['rounds']:
            entry = state['rounds'].get(round_['id'], {})
            if entry.get('status') == 'accepted':
                expected = entry.get('accepted_commits', {}).get(repo, expected)
        head = git(repo, 'rev-parse', 'master')
        if head != expected:
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
    fresh = {'rounds': {}, 'active': False}
    review.save(review.state_path(), fresh)
    accepted = review.document_path('master')
    text = accepted.read_text()
    accepted.write_text(text.split('<!-- accepted:', 1)[0].rstrip() + '\n\nNo rounds have been accepted yet. Run `./review start` to begin or resume.\n')
    review.board(plan, fresh)
    view = review.snapshot(plan, review.read_state())
    assert all(r['status'] == 'prepared' for r in view['rounds'])
    assert view['round']['id'] == plan['rounds'][0]['id']
    print(f"Reset complete: 0/{len(view['rounds'])} rounds accepted; next round {view['round']['id']}.")
    print(f'Previous decisions and documents: {backup}')
    print('Refresh THWH to load the reset state. Prepared commits and patches are preserved.')
