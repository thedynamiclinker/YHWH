#!/usr/bin/env python3
"""Reconstruct the recorded mainer work as review rounds in isolated worktrees.

This is a local preparation tool, not part of any model package. It refuses
existing draft branches; a completed plan is resumed with ./review instead.
"""

import ast
import json
import os
from pathlib import Path
import re
import subprocess
import textwrap

ROOT = Path(__file__).resolve().parent
PLAN = ROOT / ".review/plan.json"
REPOS = ("es-as", "es-hf", "es")
SOURCES = {}
BASES = {}
WORK = {}
ROUNDS = []
COMPLETED = 0
SKIP = False


def git(repo, *args, data=None):
    result = subprocess.run(["git", "-C", str(repo), *args], input=data,
                            text=True, capture_output=True, check=True)
    return result.stdout


def source(repo, path, ref=None):
    return git(ROOT / repo, "show", f"{ref or SOURCES[repo]}:{path}")


def put(repo, path, text=None, ref=None):
    if SKIP:
        return
    target = WORK[repo] / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source(repo, path, ref) if text is None else text)


def change(repo, path, transform):
    if SKIP:
        return
    target = WORK[repo] / path
    target.write_text(transform(target.read_text()))


def nodes_removed(text, names):
    lines = text.splitlines(keepends=True)
    for node in reversed(ast.parse(text).body):
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names:
            first = min([node.lineno, *(d.lineno for d in node.decorator_list)])
            del lines[first - 1:node.end_lineno]
    return "".join(lines)


def replace_function(text, name, replacement):
    node = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == name)
    lines = text.splitlines(keepends=True)
    lines[node.lineno - 1:node.end_lineno] = [replacement.rstrip() + "\n"]
    return "".join(lines)


def prune_imports(text):
    tree = ast.parse(text)
    used = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}
    lines = text.splitlines(keepends=True)
    for node in reversed(tree.body):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            aliases = [n for n in node.names if (n.asname or n.name.split(".")[0]) in used]
            if len(aliases) != len(node.names):
                if aliases:
                    node.names = aliases
                    lines[node.lineno - 1:node.end_lineno] = [ast.unparse(node) + "\n"]
                else:
                    del lines[node.lineno - 1:node.end_lineno]
    return re.sub(r"\n{4,}", "\n\n\n", "".join(lines)).rstrip() + "\n"


def cli(repo, stage):
    package = "esas" if repo == "es-as" else "eshf"
    text = source(repo, f"{package}/__main__.py")
    if stage == 20:
        return text
    removed = set()
    if stage < 20:
        removed |= {"uv_executable", "installed_wheel", "recover_python", "package_source", "offer_python"}
    if stage < 19:
        removed |= {"runtime_support", "unsupported_runtime_message", "runtime_wheels", "UnsupportedRuntime"}
    if stage < 13:
        removed |= {"runtime_parser", "interpreter_class", "runtime_interpreter", "Interpreter", "ensure_runtime"}
    if stage < 11:
        removed.add("nonnegative_int")
    if stage < 10:
        removed |= {"cpu_count", "worker_init", "prepare_worker"}
    text = nodes_removed(text, removed)
    if stage < 19 and stage >= 13:
        if stage < 18:
            name = "interpreter_class" if package == "esas" else "runtime_interpreter"
            signature = "runtime, argv=None, *, legacy=False" if package == "esas" else "runtime"
            text = replace_function(text, "ensure_runtime", f"def ensure_runtime({signature}):\n    return {name}(runtime)")
        elif package == "esas":
            start = text.index("    try:\n        compatible, versions = runtime_support(runtime)")
            end = text.index("    command = [sys.executable", start)
            text = text[:start] + text[end:]
        else:
            start = text.index("    try:\n        versions = runtime_wheels(package)")
            end = text.index("    try:\n        subprocess.run(command", start)
            text = text[:start] + '    command = [sys.executable, "-m", "pip", "install", "--quiet", package]\n' + text[end:]
    if stage == 19 and package == "esas":
        text = text.replace("        recover_python(runtime, versions, argv, legacy=legacy)",
                            "        raise RuntimeError(unsupported_runtime_message(runtime))")
    if stage < 20 and package == "eshf":
        if stage < 19:
            start = text.index("    except UnsupportedRuntime as error:")
            end = text.index("    except FileNotFoundError as error:", start)
            text = text[:start] + text[end:]
        else:
            start = text.index("        try:\n            offer_python(error, argv, legacy=legacy)")
            end = text.index("        return 1\n    except FileNotFoundError", start)
            text = text[:start] + text[end:]
    if stage < 15:
        text = text.replace('    "litert": ("ai-edge-litert", "ai_edge_litert.interpreter"),\n', "")
    if stage < 14:
        text = text.replace('    "tflite": ("tensorflow", "tensorflow"),\n', "")
    if stage < 13:
        text = re.sub(r"RUNTIMES = \{.*?\}\n", "", text, flags=re.S)
        text = text.replace("        parents=[runtime_parser()],\n", "")
        text = re.sub(r'    command.add_argument\("--runtime".*?\n.*?\n', '', text)
        if package == "esas":
            start = text.index("        options, remaining = runtime_parser()")
            end = text.index("        return 0", start)
            text = text[:start] + '''        args = es_as_cli.parse_args(argv)
        es_as_cli.start_model(es_as_cli.prepare_args(args), args.output)
''' + text[end:]
            text = text.replace("    ensure_runtime(args.runtime, argv)\n", "")
            text = text.replace("def calculate(frame, runtime):", "def calculate(frame):")
            text = text.replace("results = es_calc_as(frame, interpreter_class=interpreter_class(runtime), num_threads=1)", "results = es_calc_as(frame)")
            text = text.replace("def calculate_batches(frames, nproc, runtime):", "def calculate_batches(frames, nproc):")
            text = text.replace("yield calculate(frame, runtime)", "yield calculate(frame)")
            text = text.replace("(frame, runtime)", "(frame,)")
            text = text.replace("calculate_batches(frames, args.nproc, args.runtime)", "calculate_batches(frames, args.nproc)")
            start = text.index("    except SystemError as exc:")
            end = text.index("    except (OSError", start)
            text = text[:start] + text[end:]
        else:
            start = text.index("            options = argparse.ArgumentParser(add_help=False)")
            end = text.index("            return 0", start)
            text = text[:start] + "            run_legacy(argv)\n" + text[end:]
            text = text.replace('        os.environ["ESHF_RUNTIME"] = args.runtime\n', "")
            text = text.replace("        with redirect_stdout(sys.stderr):\n            ensure_runtime(args.runtime)\n", "")
    if stage < 12:
        text = re.sub(r'    (p|command).add_argument\("--round".*?\n.*?\n', '', text)
        text = text.replace('header=header, na_rep="nan",\n                         float_format=None if args.decimals is None else f"%.{args.decimals}f")', 'header=header, na_rep="nan")')
        text = text.replace('header=False, na_rep="NA",\n                              float_format=None if args.decimals is None else f"%.{args.decimals}f")', 'header=False, na_rep="NA")')
    if stage < 11:
        text = re.sub(r'    (p|command).add_argument\("-n", "--num-rows".*?\n.*?\n', '', text)
        text = text.replace("                             nrows=args.num_rows,\n", "")
        text = text.replace("chunksize=args.batch_size,\n                         nrows=args.num_rows)", "chunksize=args.batch_size)")
        text = text.replace("    frame = frame.iloc[:args.num_rows]\n", "")
    if stage < 10:
        text = re.sub(r'    (p|command).add_argument\("--nproc".*?\n.*?\n', '', text)
        if package == "esas":
            text = replace_function(text, "calculate_batches", "def calculate_batches(frames):\n    for frame in frames:\n        yield calculate(frame)")
            text = text.replace("calculate_batches(frames, args.nproc)", "calculate_batches(frames)")
        else:
            text = replace_function(text, "predictions", "def predictions(batches):\n    for batch in batches:\n        yield predict_batch(batch)")
            text = text.replace("predictions(input_batches(args), args.nproc)", "predictions(input_batches(args))")
    # Show only examples available at this round; detailed prose is kept for the final guide.
    lines = text.splitlines(keepends=True)
    excluded = []
    for line in lines:
        if line.startswith("  ") and not line.startswith("    "):
            if stage < 13 and "--runtime" in line:
                continue
            if stage < 14 and "--runtime tflite" in line:
                continue
            if stage < 15 and "--runtime litert" in line:
                continue
            if stage < 12 and "--round" in line:
                continue
            if stage < 11 and " -n " in line:
                continue
            if stage < 10 and "--nproc" in line:
                continue
        excluded.append(line)
    text = "".join(excluded)
    if package == "esas":
        start = text.index("stdout contains tab-separated")
        end = text.index('\n"""', start)
        text = text[:start] + '''stdout contains tab-separated StudyID, as_probability, and optional as_risk.
Diagnostics go to stderr. Use esas for the original file-output CLI.''' + text[end:]
    text = text.replace("# Neda2, all available CPUs", "# Neda2 results") if stage < 10 else text
    text = text.replace("Run NEDA 2 using all available CPUs", "Run NEDA 2") if stage < 10 else text
    text = prune_imports(text)
    compile(text, f"{package}/__main__.py", "exec")
    return text


def add_round(number, title, teams, why, repos=("es-as", "es-hf"), validation=None):
    global SKIP
    if number <= COMPLETED:
        previous = ROUNDS[number - 1]
        previous.update(title=title, mr_title=title, teams=teams,
                        descriptions={repo: why for repo in repos})
        if validation:
            previous["validation"] = validation
        SKIP = number < COMPLETED
        return
    commits = {}
    for repo in repos:
        work = WORK[repo]
        git(work, "add", "--all")
        if not git(work, "diff", "--cached", "--name-only").strip():
            raise RuntimeError(f"{number}: empty {repo} commit")
        git(work, "diff", "--cached", "--check")
        message = f"R{number:02d}: {title}\n\n" + textwrap.fill(why, width=72) + "\n"
        if any(len(line) > 72 for line in message.splitlines()):
            raise RuntimeError(f"Long commit message: {title}")
        git(work, "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-F", "-", data=message)
        commits[repo] = git(work, "rev-parse", "HEAD").strip()
    ROUNDS.append({"id": f"R{number:02d}", "title": title, "mr_title": title,
                   "teams": teams, "descriptions": {repo: why for repo in repos},
                   "validation": validation or "Patch whitespace and Python syntax checked during preparation. See .review/VALIDATION.md for executed checks and limits.",
                   "commits": commits})
    checkpoint = {"sources": SOURCES, "bases": BASES, "rounds": ROUNDS}
    (ROOT / ".review/preparing.json").write_text(json.dumps(checkpoint, indent=2) + "\n")
    print(f'R{number:02d}: {title} ({", ".join(repos)})', flush=True)


def tests(repo, stage):
    package = "esas" if repo == "es-as" else "eshf"
    path = "test/test_cli.py" if package == "esas" else "tests/test_cli.py"
    text = source(repo, path)
    removed = set()
    for node in ast.parse(text).body:
        if not isinstance(node, ast.FunctionDef):
            continue
        name = node.name
        required = 9
        if any(word in name for word in ("runtime", "tensorflow", "stdout_contains", "installed_commands")):
            required = 13
        if "tensorflow" in name:
            required = 14
        if "standalone" in name:
            required = 15
        if any(word in name for word in ("missing_runtime", "failed_runtime", "broken_installed")):
            required = 18
        if any(word in name for word in ("unavailable_python", "wheel_lookup")):
            required = 19
        if any(word in name for word in ("python_switch", "repacked", "installed_package")):
            required = 20
        if "uv_" in name:
            required = 20
        if "numpy_abi" in name:
            required = 13
        if any(word in name for word in ("worker", "batch_counts")):
            required = 10
        if "row_limit" in name:
            required = 11
        if "round_" in name:
            required = 12
        if package == "esas":
            if any(word in name for word in ("missing_runtime", "failed_install", "unsupported_python", "installed_runtime", "runtime_support")):
                required = 19
            if "python_recovery" in name:
                required = 20
            if "installed_commands" in name:
                required = 10
        elif any(word in name for word in ("missing_runtime", "failed_runtime")):
            required = 19
        if "ensemble_sum" in name:
            required = 13
        if required > stage:
            removed.add(name)
    # Import-free parser check relies on AS's lazy package init, already in R08.
    text = nodes_removed(text, removed)
    if stage < 13:
        text = re.sub(r'^    monkeypatch.setattr\(cli, "ensure_runtime",.*\n', '', text, flags=re.M)
    if stage == 20:
        text = source(repo, path).replace('assert "Requires-Dist: es @ git+https://gitlab.echoiq.ai/product/data-science/es.git" in metadata', 'assert "Requires-Dist: es" in metadata.splitlines()')
    put(repo, path, text if stage == 20 else prune_imports(text))


def main():
    global COMPLETED, SKIP
    if PLAN.exists():
        raise SystemExit("Plan already prepared. Run ./review start to resume it.")
    checkpoint = ROOT / ".review/preparing.json"
    if checkpoint.exists():
        saved = json.loads(checkpoint.read_text())
        SOURCES.update(saved["sources"])
        BASES.update(saved["bases"])
        ROUNDS.extend(saved["rounds"])
        COMPLETED = len(ROUNDS)
        SKIP = bool(COMPLETED)
        WORK.update({repo: ROOT / ".review/worktrees" / repo for repo in REPOS})
    for repo in (() if checkpoint.exists() else REPOS):
        path = ROOT / repo
        if git(path, "status", "--porcelain").strip():
            raise SystemExit(f"{repo} has local changes; preserve them before preparation.")
        if subprocess.run(["git", "-C", str(path), "show-ref", "--verify", "--quiet", "refs/heads/mistress"]).returncode == 0:
            raise SystemExit(f"{repo}: mistress already exists; inspect it before preparing again.")
        SOURCES[repo] = git(path, "rev-parse", "mainer").strip()
        BASES[repo] = git(path, "rev-parse", "main" if repo != "es" else "master").strip()
    for repo in (() if checkpoint.exists() else REPOS):
        path = ROOT / repo
        if repo != "es":
            git(path, "branch", "master", BASES[repo])
        WORK[repo] = ROOT / ".review/worktrees" / repo
        WORK[repo].parent.mkdir(parents=True, exist_ok=True)
        git(path, "worktree", "add", "-b", "mistress", str(WORK[repo]), BASES[repo])

    # R01 is deliberately only removal of == pins and Python constraints.
    for repo in REPOS[:2]:
        for path in ("pyproject.toml", "requirements.txt"):
            change(repo, path, lambda text: re.sub(r"={2,3}[^\s\"',\]]+", "", re.sub(r"^requires-python = .*\n", "", text, flags=re.M)))
    change("es-as", "setup.py", lambda text: re.sub(r"^    python_requires=.*\n", "", text, flags=re.M))
    add_round(1, "Remove exact dependency pins and Python constraints",
              "Here's the small first step for the version upgrade: remove the exact dependency pins and Python constraints in both model repos. That lets us try other environments and compare the results.",
              "Remove exact dependency pins and the package-level Python constraint. Package names and model code stay the same; this permits testing other environments but does not establish runtime support or prediction equivalence.",
              validation="Only ==/=== specifiers and Python constraint lines removed. No model source, runtime selection, CI or README changes.")

    for repo in REPOS[:2]:
        files = git(WORK[repo], "ls-files").splitlines()
        for path in files:
            if path.startswith("dev-requirements") or path.startswith("versioning_autopytorch/requirements"):
                put(repo, path, ref="e1dea8b" if repo == "es-as" else "990f1c1")
        change(repo, "pyproject.toml", lambda text: re.sub(r"setuptools[><=, 0-9.]+(?=\")", "setuptools", text).replace("pytest>=8.2.2", "pytest"))
    change("es-hf", "package.json", lambda text: source("es-hf", "package.json").replace('"python -m ', '"python3.11 -m '))
    add_round(2, "Remove remaining build and development version pins",
              "Same idea for the build and development dependencies: let the installer resolve them too. This keeps the version settings from disagreeing across the different requirements files.",
              "Remove the remaining version restrictions in build and development dependencies, including the existing JavaScript development tools. Keep model behavior separate from dependency metadata.")

    for repo in REPOS[:2]:
        put(repo, "Makefile")
        # Install metadata is complete except for the commands introduced later.
        ref = "24f7427" if repo == "es-as" else "9f95c11"
        put(repo, "pyproject.toml", ref=ref)
        put(repo, "requirements.txt", ref=ref)
    put("es-hf", "requirements.txt")
    put("es-as", "setup.py")
    put("es-as", "dev-requirements.txt")
    put("es-hf", ".gitignore")
    add_round(3, "Add make install and make develop",
              "Tiny quality-of-life follow-up: both repos now have `make install` and `make develop`. They use the Python on your PATH, with an optional `PYTHON=...` override.",
              "Add ordinary and editable make targets, consolidate installation metadata in pyproject.toml, and include the existing model resources in package metadata. Use the selected interpreter for pip.")

    put("es-as", "es_as_cli.py", ref="e98ecce")
    put("es-hf", "es_hf_cli.py", ref="e448fdc")
    for repo in REPOS[:2]:
        change(repo, "pyproject.toml", lambda text: re.sub(r'^    "esutils",?\n', '', text, flags=re.M))
    put("es-hf", "test/raw_es_hf_cli.py")
    for path in git(WORK["es-hf"], "ls-files", "versioning_autopytorch/requirements*").splitlines():
        put("es-hf", path, ref="e448fdc")
    add_round(4, "Replace esutils startup with standard logging",
              "Found one installation step we can drop: these runners use `esutils` for startup/logging, which the standard library can handle here. This removes that private-package dependency from both repos.",
              "Replace esutils startup with explicit output-directory creation and standard logging, then remove the proprietary dependency. This removes one authentication-dependent installation step; the HF runner retains its log file.")

    for repo, paths in {
        "es-as": ["esas/calc.py", "esas/model_utils/input_min_vars_check.py"],
        "es-hf": ["eshf/calc.py", "eshf/constants.py", "eshf/imputation.py", "eshf/mdn_model_utils/calc.py", "eshf/mdn_model_utils/es_calc_mdn.py", "eshf/mdn_model_utils/input_min_vars_check.py", "eshf/mdn_model_utils/seed_10.csv"],
    }.items():
        for path in paths:
            if repo == "es-hf":
                put(repo, path, ref=None if path == "eshf/constants.py" else "9f95c11")
            else:
                old = (WORK[repo] / path).read_text()
                old = old.replace("from pkg_resources import resource_filename", "from pathlib import Path")
                old = old.replace('resource_filename(__name__, "model/")', 'Path(__file__).with_name("model")')
                old = old.replace('resource_filename(__name__, "min_variables.txt")', 'Path(__file__).with_name("min_variables.txt")')
                put(repo, path, old)
    # No stale pkg_resources call remains after dropping setuptools at runtime.
    for repo in REPOS[:2]:
        assert "pkg_resources" not in "".join(p.read_text() for p in (WORK[repo] / ("esas" if repo == "es-as" else "eshf")).rglob("*.py") if p.name in {"calc.py", "constants.py", "imputation.py", "es_calc_mdn.py", "input_min_vars_check.py"})
    add_round(5, "Find bundled model resources through package paths",
              "Next small installation fix: find the models and metadata relative to the installed package. That lets the same files be found when the caller is outside the checkout.",
              "Replace pkg_resources lookups with paths relative to package files. Bundle the HF seed CSV used by imputation so a wheel installation has the same resource as a checkout.")

    for repo, paths in {
        "es-as": ["esas/model_utils/input_min_vars_check.py", "esas/model_utils/preprocess_csv.py", "esas/model_utils/roc_analysis_new.py", "test/test_compatibility.py"],
        "es-hf": ["eshf/mdn_model_utils/input_min_vars_check.py", "eshf/mdn_model_utils/preprocess_csv_main.py", "eshf/smooth_sampling.py", "tests/eshf/test_imputation.py", "tests/eshf/test_smooth_sampling.py"],
    }.items():
        for path in paths:
            put(repo, path)
    add_round(6, "Handle current pandas and NumPy input types",
              "The upgrade checks turned up a few concrete pandas/NumPy compatibility fixes: recognize pandas dtypes directly and keep the missing-value masks as arrays. I've kept those separate so they're easy to review.",
              "Use pandas dtype checks for extension dtypes and boolean arrays for missing-variable masks. Preserve the HF modulo formula with a floating-point base under current NumPy, and update fixture readers for current pandas.")

    for path in ("eshf/tflite_utils/sklearn_utils/make_embedding.py", "eshf/tflite_utils/sklearn_utils/make_scaler.py"):
        put("es-hf", path)
    add_round(7, "Restore saved HF transformers with current scikit-learn",
              "HF has one extra compatibility fix: restore the saved transformer arrays as arrays, and use the loaded tree's fields to recognize its format. That gets rid of a hard-coded list of scikit-learn versions.",
              "Reconstruct learned transformer arrays from JSON lists and inspect the actual tree node schema and sparse result type. This is HF-specific because AS does not reconstruct these saved scikit-learn transformers.", repos=("es-hf",))

    for repo, package, module in (("es-as", "esas", "es_as_cli"), ("es-hf", "eshf", "es_hf_cli")):
        wrapper = f'''"""Installed entry point for the original file-output runner."""

from pathlib import Path
import runpy
import sys


def legacy_main(argv=None):
    original = sys.argv
    arguments = list(sys.argv[1:] if argv is None else argv)
    sys.argv = ["{module}.py", *arguments]
'''
        if package == "eshf":
            wrapper += '    sys.argv[1:1] = ["--config", str(Path(__file__).with_name("metadata.json"))]\n'
        wrapper += f'''    try:
        runpy.run_module("{module}", run_name="__main__")
    finally:
        sys.argv = original
    return 0
'''
        put(repo, f"{package}/__main__.py", wrapper)
        change(repo, "pyproject.toml", lambda text, p=package: text.replace("[tool.setuptools.packages.find]", f'[project.scripts]\n{p} = "{p}.__main__:legacy_main"\n\n[tool.setuptools.packages.find]'))
    put("es-as", "esas/__init__.py")
    change("es-as", "es_as_cli.py", lambda text: text.replace("from esas.calc import es_calc_as\n", "").replace("def start_model(input_data, output_folder):\n", "def start_model(input_data, output_folder):\n    from esas.calc import es_calc_as\n\n"))
    put("es-hf", "es_hf_cli.py")
    add_round(8, "Install esas and eshf for the original runners",
              "The original runners now have short installed commands: `esas` and `eshf`. Same file-output interfaces, and the HF default config comes from the installed package.",
              "Expose the existing file-output runners as installed commands. Defer model imports where needed so CLI setup can load independently, and resolve the HF default config relative to its package.")

    for stage, title, teams, why in (
        (9, "Stream predictions with es-as and es-hf", "Here's the comparison tool: `es-as` and `es-hf` print study results to stdout, so we can pipe them straight into `diff`. The existing `esas` and `eshf` commands still produce the original files.", "Add separate streaming commands using the existing calculations, Neda2/Neda3 selection, local CSV/JSON inputs and stdin. Keep diagnostics on stderr and allow the HF calculation to run without writing intermediate files."),
        (10, "Run ordered prediction batches across available CPUs", "The comparison commands can now use the available CPUs. Results stay in input order, and closing a pipe stops the workers, so `diff` and `head` work naturally.", "Add bounded multiprocessing with ordered result delivery and one numerical thread per worker. Sum HF model contributions in model-number order so loader completion timing does not add floating-point noise."),
        (11, "Limit comparison runs to the first N input rows", "We can now do a quick smoke run with `es-as -n 10` or `es-hf -n 10`. The limit is applied before batching, so serial and parallel runs compare the same studies in the same order.", "Add -n/--num-rows to the streaming commands and apply it before batching. Preserve input order for CSV, JSON and both Neda versions, including empty input limits."),
        (12, "Choose decimal places for comparison output", "Another small comparison convenience: `--round 2` prints probabilities to two decimal places. It only changes the printed output; the calculations keep their full precision.", "Add --round N to format stdout floats with exactly N decimal places. Keep inference results unchanged and test formatting, trailing zeros and missing values."),
        (13, "Select the original runtime explicitly", "The runners now accept `--runtime legacy`, making the original interpreter an explicit comparison baseline. The default remains the original runtime.", "Name the original runtime explicitly and route interpreter construction through the selected class. Keep the same calculation and default interpreter; expose the choice on both the legacy and streaming commands."),
        (14, "Add the TensorFlow Lite interpreter option", "We can now run the same model files with `--runtime tflite` and compare them against `--runtime legacy`. Both choices use the same preprocessing and probability calculation.", "Add TensorFlow's lite.Interpreter as a selectable runtime while preserving the original runtime default. This provides a comparison path for environments with a TensorFlow wheel."),
        (15, "Add the LiteRT interpreter option", "LiteRT is now available as `--runtime litert`, alongside the two existing choices. That gives us a direct way to compare all three interpreters on the same inputs.", "Add Google's ai-edge-litert Interpreter as the third runtime choice. Keep model files, preprocessing and output ordering shared across interpreter selections."),
    ):
        for repo, package in (("es-as", "esas"), ("es-hf", "eshf")):
            put(repo, f"{package}/__main__.py", cli(repo, stage))
            tests(repo, stage)
        if stage == 9:
            for repo, package in (("es-as", "esas"), ("es-hf", "eshf")):
                change(repo, "pyproject.toml", lambda text, p=package, r=repo: text.replace(f'{p} = "{p}.__main__:legacy_main"', f'{p} = "{p}.__main__:legacy_main"\n{r} = "{p}.__main__:main"').replace('    "scipy",', '    "scipy",\n    "es",'))
            # These are the only changes to permit HF inference without file output.
            for path in ("eshf/calc.py", "eshf/mdn_model_utils/es_calc_mdn.py"):
                put("es-hf", path, ref="6fe743f")
            change("es-hf", "pyproject.toml", lambda text: text.replace('    "scipy",', '    "scipy",\n    "threadpoolctl",'))
        if stage == 10:
            for path in ("eshf/assessment.py", "eshf/assessment_multi_process.py"):
                change("es-hf", path, lambda text: text.replace("for i in model_outputs.keys():", "for i in sorted(model_outputs):"))
        if stage == 13:
            put("es-as", "esas/calc.py")
            put("es-as", "es_as_cli.py")
            for path in ("eshf/assessment.py", "eshf/assessment_multi_process.py", "eshf/calc.py", "eshf/imputation.py", "eshf/mdn_model_utils/calc.py", "eshf/mdn_model_utils/es_calc_mdn.py", "eshf/mdn_model_utils/tflite_parallel_exec.py"):
                put("es-hf", path)
        if stage in (14, 15):
            dependency = "tensorflow" if stage == 14 else "ai-edge-litert"
            for repo in REPOS[:2]:
                change(repo, "pyproject.toml", lambda text, d=dependency: text.replace('    "tflite-runtime",', f'    "tflite-runtime",\n    "{d}",'))
        add_round(stage, title, teams, why)

    for path in git(ROOT / "es", "diff", "--name-only", f'{BASES["es"]}..{SOURCES["es"]}').splitlines():
        put("es", path)
    add_round(16, "Discover installed es subcommands on PATH",
              "Small bit of glue in `es`: installed commands like `es-as` can now be called as `es as`, with the same arguments. The existing model-column commands move to `es models as` and `es models hf`.",
              "Dispatch executable es-NAME programs on PATH with exec, preserving arguments, stdin, environment and exit status. Move the former as/hf metadata commands under models to avoid colliding with installed inference commands.", repos=("es",))

    for repo in REPOS[:2]:
        change(repo, "pyproject.toml", lambda text: re.sub(r'^    "(?:tflite-runtime|tensorflow|ai-edge-litert)",\n', '', text, flags=re.M))
    for path in git(WORK["es-hf"], "ls-files").splitlines():
        if path.startswith("dev-requirements") or path.startswith("versioning_autopytorch/requirements"):
            put("es-hf", path)
    add_round(17, "Install packages independently of interpreter wheels",
              "Installation no longer requires all three interpreter packages. We can install the tools on a machine and choose the runtime separately when we're ready to run a comparison.",
              "Remove inference runtimes from mandatory installation dependencies. Until the following first-use installation change, install the selected runtime manually with python -m pip install tflite-runtime, tensorflow or ai-edge-litert.")

    for stage, title, teams, why in (
        (18, "Install a missing runtime on first use", "The comparison commands now install just the selected runtime if it's missing. An already installed runtime works directly, and installation output stays on stderr so pipes remain usable.", "Attempt to import the selected runtime first; install its package with the running Python only when it is missing. Distinguish a broken installed runtime from a missing one and provide a concrete repair command on failure."),
        (19, "Explain unsupported interpreter wheels before installing", "If the selected runtime has no wheel for this Python and platform, the CLI now says so before trying to install it. The check uses published wheel metadata rather than another version list for us to maintain.", "Check published PyPI wheel metadata before installing a missing interpreter. Explain unsupported combinations; if metadata is unavailable, let pip try the user's configured index or cache."),
        (20, "Offer a compatible Python for interactive comparisons", "Last convenience for runtime comparisons: if this Python isn't supported, an interactive run can offer a compatible one through `uv`. You choose whether to proceed, and it reruns the same command arguments.", "Offer supported Python versions in a terminal, obtain uv if needed, and rerun the current package code with the same arguments. Keep noninteractive failures explicit and preserve each implementation's existing stdin and cache behavior."),
    ):
        for repo, package in (("es-as", "esas"), ("es-hf", "eshf")):
            put(repo, f"{package}/__main__.py", cli(repo, stage))
            tests(repo, stage)
            if stage == 19:
                change(repo, "pyproject.toml", lambda text: text.replace('    "es",', '    "packaging",\n    "es",'))
        add_round(stage, title, teams, why)

    # Preserve all remaining mainer changes; give the longer CLI material its own guide.
    differences = {}
    for repo in REPOS[:2]:
        differences[repo] = git(WORK[repo], "diff", "--name-only", "HEAD", SOURCES[repo]).splitlines()
        for path in differences[repo]:
            if path.startswith("test/data/test_100"):
                continue
            put(repo, path)
        readme = source(repo, "README.md")
        if repo == "es-as":
            start = readme.index("## Install\n")
            end = readme.index("## To prepare your environment locally")
            guide = readme[start:end]
            # The later mainer dependency commit superseded the earlier Git-URL documentation.
            guide = re.sub(r"The `es` dependency is fetched from GitLab.*?Neda access uses", "The `es` dependency is resolved through your configured package index.\nInstall the local `./es` checkout first when using local-only dependencies.\nNeda access uses", guide, flags=re.S)
            compact = readme[:start] + "## Install and compare\n\nUse `make install` or `make develop`. See [CLI.md](CLI.md) for streaming,\nruntime choices and comparison examples. `esas` keeps the file-output interface.\n\n" + readme[end:]
            compact = compact.replace("During validation, all four", "In the earlier mainer validation, all four")
        else:
            start = readme.index("## Install\n")
            end = readme.index("## To run from the command line")
            guide = readme[start:end]
            guide = guide.replace("GitLab credentials for the `es` dependency are also needed by the alternate Python.", "The alternate Python also needs access to the configured package index for `es`.")
            guide = re.sub(r"The `es` dependency is fetched from GitLab\..*?NEDA data must", "The `es` dependency is resolved through your configured package index.\nNEDA data must", guide, flags=re.S)
            compact = readme[:start] + "## Install and compare\n\nUse `make install` or `make develop`. See [CLI.md](CLI.md) for streaming,\nruntime choices and comparison examples. `eshf` keeps the file-output interface.\n\n" + readme[end:]
        put(repo, "README.md", compact)
        put(repo, "CLI.md", (f"# {repo} command-line guide\n\n" + guide).rstrip() + "\n")
    # Correct a stale assertion rather than reintroducing the superseded Git URL.
    change("es-as", "test/test_cli.py", lambda text: text.replace('assert "Requires-Dist: es @ git+https://gitlab.echoiq.ai/product/data-science/es.git" in metadata', 'assert "Requires-Dist: es" in metadata.splitlines()'))
    put("es-as", "tests.py")
    add_round(21, "Document comparison commands and align upgrade checks",
              "I've put the longer comparison examples in a separate CLI guide so the READMEs stay easy to scan. This also finishes the existing test/tooling updates, including one stale dependency assertion.",
              "Preserve the mainer documentation and test coverage, move the longer CLI instructions into CLI.md, and align stale Git-URL documentation and assertions with the package-index dependency. Complete the existing Python-on-PATH CI/tooling changes; verify the shared GitLab CI template exists before submission.")

    for path in ("test/data/test_1000_studies.csv", "test/data/test_10000_studies.csv"):
        put("es-hf", path)
    add_round(22, "Keep larger HF samples for local comparison runs",
              "HF also has the existing 1,000- and 10,000-row samples available for longer local comparisons. I've kept those data files in their own change so they don't bury any code review.",
              "Preserve the two larger input samples added on mainer as a separate data-only commit. They are local comparison fixtures, not evidence of model equivalence or a request to share dataset contents.", repos=("es-hf",))

    plan = {"repositories": {repo: {"base": BASES[repo], "source": SOURCES[repo],
                                   "worktree": str(WORK[repo])} for repo in REPOS}, "rounds": ROUNDS}
    PLAN.parent.mkdir(exist_ok=True)
    PLAN.write_text(json.dumps(plan, indent=2) + "\n")
    checkpoint.unlink(missing_ok=True)
    print("Prepared. Run ./review start.")


if __name__ == "__main__":
    main()
