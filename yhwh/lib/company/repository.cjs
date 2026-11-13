const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const path = require("node:path");
const exec = promisify(execFile);

async function git(cwd, args, input) {
  // No shell, repository hooks, signing, external diff programs, or global aliases.
  const child = exec(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.quotePath=false",
      ...args,
    ],
    {
      cwd,
      maxBuffer: 12 * 1024 * 1024,
      timeout: 30000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_AUTHOR_NAME: "YHWH Rehearsal",
        GIT_AUTHOR_EMAIL: "rehearsal@localhost",
        GIT_COMMITTER_NAME: "YHWH Rehearsal",
        GIT_COMMITTER_EMAIL: "rehearsal@localhost",
      },
    },
  );
  if (input !== undefined) child.child.stdin.end(input);
  try {
    return (await child).stdout.trimEnd();
  } catch (error) {
    throw new Error((error.stderr || error.message).trim().slice(0, 2500));
  }
}

async function createDemo(directory) {
  await fs.mkdir(directory, { recursive: true });
  await git(directory, ["init", "-b", "main"]);
  await fs.writeFile(
    path.join(directory, "requirements.txt"),
    "requests==2.32.3\nrich==13.9.4\n",
  );
  await fs.writeFile(
    path.join(directory, "README.md"),
    "# Example project\n\nRun the script from this directory.\n",
  );
  await git(directory, ["add", "."]);
  await git(directory, ["commit", "-m", "Start the example project"]);
  await git(directory, ["checkout", "-b", "mistress"]);
  const steps = [
    {
      title: "Let the environment choose dependency versions",
      file: "requirements.txt",
      content: "requests\nrich\n",
      summary:
        "Remove exact dependency pins so a compatible environment can choose its versions. Keep the change separate from runtime behavior.",
    },
    {
      title: "Document a reproducible verification command",
      file: "README.md",
      content:
        "# Example project\n\nRun the script from this directory.\n\nCheck the environment with `python -m pip check`.\n",
      summary:
        "Add a single documented command to check installed dependency compatibility. This checks the environment, not application output equivalence.",
    },
    {
      title: "Make the project installable",
      file: "pyproject.toml",
      content:
        '[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "company-example"\nversion = "0.1.0"\ndependencies = ["requests", "rich"]\n\n[tool.setuptools]\npy-modules = []\n',
      summary:
        "Add standard packaging metadata so the project can be installed from another directory. Keep the existing example files unchanged.",
    },
    {
      title: "Record a one-step rollback",
      file: "ROLLBACK.md",
      content:
        "# Rollback\n\nRevert the individual change being reviewed.\nKeep the previous environment until the comparison is complete.\n",
      summary:
        "Write down how to undo one change without unwinding unrelated work. Reviewers should not have to reconstruct the recovery plan.",
    },
  ];
  for (const step of steps) {
    await fs.writeFile(path.join(directory, step.file), step.content);
    await git(directory, ["add", step.file]);
    await git(directory, ["commit", "-m", step.title]);
    step.commit = await git(directory, ["rev-parse", "HEAD"]);
    step.patch = await git(directory, [
      "show",
      "--format=",
      "--binary",
      "--no-ext-diff",
      "HEAD",
    ]);
  }
  await git(directory, ["checkout", "-b", "master", "main"]);
  return steps;
}

async function importRepository(source, directory, base, draft) {
  if (
    ![base, draft].every(
      (ref) =>
        typeof ref === "string" &&
        /^[\w./-]+$/.test(ref) &&
        !ref.startsWith("-"),
    )
  )
    throw new Error("Use a branch name or commit ID for each reference.");
  const root = await git(source, ["rev-parse", "--show-toplevel"]);
  if (path.resolve(root) !== path.resolve(source))
    throw new Error("Choose the repository root directory.");
  const baseId = await git(source, [
    "rev-parse",
    "--verify",
    `${base}^{commit}`,
  ]);
  const draftId = await git(source, [
    "rev-parse",
    "--verify",
    `${draft}^{commit}`,
  ]);
  await git(source, ["merge-base", "--is-ancestor", baseId, draftId]);
  const ids = (
    await git(source, [
      "rev-list",
      "--reverse",
      "--no-merges",
      `${baseId}..${draftId}`,
    ])
  )
    .split("\n")
    .filter(Boolean);
  if (!ids.length)
    throw new Error(
      "No non-merge commits between these references. Choose a base before the proposed changes.",
    );
  if (ids.length > 100)
    throw new Error(
      "Choose a smaller range: the POC supports up to 100 commits per import.",
    );
  await fs.mkdir(path.dirname(directory), { recursive: true });
  // Cloning by object ID preserves source branches, index, hooks and worktree.
  await git(path.dirname(directory), [
    "clone",
    "--no-hardlinks",
    "--no-checkout",
    "--",
    source,
    directory,
  ]);
  await git(directory, ["checkout", "--detach", baseId]);
  await git(directory, ["branch", "-f", "mistress", draftId]);
  await git(directory, ["checkout", "-B", "master", baseId]);
  const steps = [];
  for (const commit of ids) {
    const title = await git(directory, ["show", "-s", "--format=%s", commit]);
    const body = await git(directory, ["show", "-s", "--format=%b", commit]);
    const patch = await git(directory, [
      "show",
      "--format=",
      "--binary",
      "--no-ext-diff",
      commit,
    ]);
    if (Buffer.byteLength(patch) > 500000)
      throw new Error(
        `Patch too large for the review editor: ${title}. Choose a smaller range.`,
      );
    steps.push({
      title,
      summary: body || `Review the proposed change: ${title}.`,
      patch,
      commit,
    });
  }
  return steps;
}

async function commitPatch(directory, patch, message) {
  if (!patch.trim())
    throw new Error(
      "The patch is empty. Keep at least one hunk, or reject this round.",
    );
  const before = await git(directory, ["rev-parse", "HEAD"]);
  try {
    await git(
      directory,
      ["apply", "--check", "--index", "--binary", "-"],
      `${patch.trimEnd()}\n`,
    );
    await git(
      directory,
      ["apply", "--index", "--binary", "-"],
      `${patch.trimEnd()}\n`,
    );
    await git(directory, ["commit", "-m", message]);
    return await git(directory, ["rev-parse", "HEAD"]);
  } catch (error) {
    // This is exclusively the app-owned rehearsal clone, never the source repo.
    await git(directory, ["reset", "--hard", before]);
    await git(directory, ["clean", "-fd"]);
    throw new Error(
      `The rehearsal patch could not be committed. Nothing was approved. ${error.message}`,
    );
  }
}

function hunks(patch) {
  const files = patch.split(/(?=^diff --git )/m).filter(Boolean);
  return files.flatMap((file, fileIndex) => {
    const offset = file.search(/^@@ /m);
    if (offset < 0)
      return [
        {
          id: `${fileIndex}:0`,
          header: "",
          text: file,
          label: file.split("\n")[0],
          whole: true,
        },
      ];
    const header = file.slice(0, offset);
    return file
      .slice(offset)
      .split(/(?=^@@ )/m)
      .filter(Boolean)
      .map((text, index) => ({
        id: `${fileIndex}:${index}`,
        header,
        text,
        label: `${file.split("\n")[0].replace("diff --git ", "")} ${text.split("\n")[0]}`,
      }));
  });
}

function selectedPatch(patch, excluded = []) {
  const kept = hunks(patch).filter((hunk) => !excluded.includes(hunk.id));
  let lastHeader = null;
  return kept
    .map((hunk) => {
      const header = hunk.header === lastHeader ? "" : hunk.header;
      lastHeader = hunk.header;
      return header + hunk.text;
    })
    .join("");
}

module.exports = {
  git,
  createDemo,
  importRepository,
  commitPatch,
  hunks,
  selectedPatch,
};
