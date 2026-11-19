import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


LAUNCHER = Path(__file__).resolve().parents[1] / "bin" / "shaddai"


class LaunchTests(unittest.TestCase):
    def run_shaddai(self, *args):
        with TemporaryDirectory() as directory:
            return subprocess.run(
                [LAUNCHER, *args], cwd=directory, stdin=subprocess.DEVNULL,
                capture_output=True, text=True, timeout=10,
                env={**os.environ, "SHADDAI_PYTHON": sys.executable,
                     "SHADDAI_SYSTEM_PREFIX": directory, "XDG_CONFIG_HOME": directory},
            )

    def test_doctor_initializes_the_workspace_without_a_terminal(self):
        result = self.run_shaddai("--doctor")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("workspace ready", result.stdout)

    def test_interactive_launch_requires_a_terminal(self):
        result = self.run_shaddai()

        self.assertEqual(result.returncode, 1)
        self.assertIn("an interactive terminal is required", result.stderr)
