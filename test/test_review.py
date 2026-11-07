"""Exercise review decisions against disposable real Git repositories."""

from contextlib import redirect_stdout
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader("local_review", str(Path(__file__).resolve().parents[1] / "review"))
spec = importlib.util.spec_from_loader(loader.name, loader)
review = importlib.util.module_from_spec(spec)
loader.exec_module(review)


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.override = patch.object(review, "ROOT", self.root)
        self.override.start()
        self.addCleanup(self.override.stop)
        (self.root / "Kanbun.md").write_text("---\nkanban-plugin: board\n---\n\n## Todo\n\n- [ ] User task\n\n## In Progress\n\n## Review\n\n## Done\n\n%% kanban:settings\n{}\n%%\n")
        self.plan = {"repositories": {}, "rounds": []}
        commits = {}
        for repo in ("alpha", "beta"):
            path = self.root / repo
            path.mkdir()
            subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True)
            review.git(repo, "config", "user.name", "Review test")
            review.git(repo, "config", "user.email", "test@example.invalid")
            (path / "value.txt").write_text("original\n")
            review.git(repo, "add", ".")
            review.git(repo, "commit", "-qm", "Base")
            base = review.git(repo, "rev-parse", "HEAD").strip()
            review.git(repo, "branch", "master")
            review.git(repo, "checkout", "-qb", "mistress")
            (path / "value.txt").write_text("candidate\n")
            review.git(repo, "commit", "-qam", "R01: Small change")
            commits[repo] = review.git(repo, "rev-parse", "HEAD").strip()
            self.plan["repositories"][repo] = {"base": base, "source": commits[repo]}
        self.round = {"id": "R01", "title": "Small change", "teams": "One small useful change.",
                      "mr_title": "Small change", "descriptions": {r: "Visible benefit." for r in commits},
                      "validation": "Disposable Git integration checks.", "commits": commits}
        self.plan["rounds"].append(self.round)
        self.state = {"rounds": {}}

    def accept(self):
        with redirect_stdout(io.StringIO()):
            review.accept(self.plan, self.state, self.round)

    def test_accept_commits_both_repositories_without_touching_checkouts(self):
        self.accept()
        for repo, source in self.round["commits"].items():
            self.assertEqual(review.git(repo, "show", "master:value.txt"), "candidate\n")
            self.assertEqual(review.git(repo, "rev-parse", "mistress").strip(), source)
            self.assertEqual(review.git(repo, "branch", "--show-current").strip(), "mistress")
            self.assertEqual(review.git(repo, "status", "--porcelain"), "")
        self.assertIsNone(review.current(self.plan, self.state))
        self.assertIn("One small useful change.", (self.root / "MASTER.md").read_text())
        self.assertIn("- [x] [R01]", (self.root / "Kanbun.md").read_text())

    def test_rejection_preserves_comments_and_blocks_acceptance(self):
        review.comment(self.state, self.round, "Please simplify this", "value.txt", reject=True)
        with self.assertRaisesRegex(RuntimeError, "Changes are requested"):
            self.accept()
        saved = review.read_state()
        self.assertEqual(saved["rounds"]["R01"]["comments"][0]["text"], "Please simplify this")
        for repo, meta in self.plan["repositories"].items():
            self.assertEqual(review.git(repo, "rev-parse", "master").strip(), meta["base"])

    def test_interrupted_paired_acceptance_is_recoverable_and_documented_once(self):
        original = review.finish_pending
        with patch.object(review, "finish_pending", side_effect=RuntimeError("interrupted")):
            with self.assertRaisesRegex(RuntimeError, "interrupted"):
                self.accept()
        pending = review.read_state()["pending"]
        review.git("alpha", "update-ref", "refs/heads/master", pending["after"]["alpha"], pending["before"]["alpha"])
        resumed = review.read_state()
        original(self.plan, resumed)
        original(self.plan, resumed)
        review.record(self.round, resumed)
        self.assertNotIn("pending", review.read_state())
        text = (self.root / "MASTER.md").read_text()
        self.assertEqual(text.count("<!-- accepted:R01 -->"), 1)
        self.assertEqual(review.git("beta", "rev-parse", "master").strip(), pending["after"]["beta"])

    def test_external_branch_movement_stops_the_entire_pair(self):
        base = self.plan["repositories"]["alpha"]["base"]
        review.git("beta", "update-ref", "refs/heads/master", self.round["commits"]["beta"])
        with self.assertRaisesRegex(RuntimeError, "differs from"):
            self.accept()
        self.assertEqual(review.git("alpha", "rev-parse", "master").strip(), base)

    def test_patch_edits_and_final_message_edits_are_used(self):
        directory = self.root / ".review/edits/R01"
        directory.mkdir(parents=True)
        (directory / "alpha.patch").write_text(review.patch(self.round, "alpha").replace("+candidate", "+revised"))
        self.state["rounds"]["R01"] = {"copy": {"teams": "Revised Teams message."}}
        self.accept()
        self.assertEqual(review.git("alpha", "show", "master:value.txt"), "revised\n")
        self.assertIn("Revised Teams message.", (self.root / "MASTER.md").read_text())

    def test_invalid_second_patch_moves_neither_branch(self):
        directory = self.root / ".review/edits/R01"
        directory.mkdir(parents=True)
        (directory / "beta.patch").write_text("This is not a patch\n")
        with self.assertRaises(RuntimeError):
            self.accept()
        for repo, meta in self.plan["repositories"].items():
            self.assertEqual(review.git(repo, "rev-parse", "master").strip(), meta["base"])

    def test_board_sync_preserves_user_cards_and_settings(self):
        review.board(self.plan, self.state)
        first = (self.root / "Kanbun.md").read_text()
        review.board(self.plan, self.state)
        text = (self.root / "Kanbun.md").read_text()
        self.assertEqual(first, text)
        self.assertEqual(text.count("[R01]"), 1)
        self.assertIn("- [ ] User task", text)
        self.assertIn("%% kanban:settings\n{}\n%%", text)

    def test_a_checked_out_master_cannot_be_updated(self):
        review.git("beta", "checkout", "-q", "master")
        with self.assertRaisesRegex(RuntimeError, "master is checked out"):
            self.accept()
        for repo, meta in self.plan["repositories"].items():
            self.assertEqual(review.git(repo, "rev-parse", "master").strip(), meta["base"])


if __name__ == "__main__":
    unittest.main()
