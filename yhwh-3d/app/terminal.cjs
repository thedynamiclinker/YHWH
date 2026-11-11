const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { quote } = require("./config.cjs");

class Terminal {
  constructor(child, cwdFile, send) {
    this.child = child;
    this.cwdFile = cwdFile;
    this.buffer = "";
    this.send = send;
    this.pendingCwd = null;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      this.buffer += data;
      let end;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        try {
          const msg = JSON.parse(line);
          send(msg);
        } catch {}
      }
    });
    child.on("error", (error) => send({ type: "error", data: error.message }));
    child.stderr.on("data", (data) =>
      send({ type: "error", data: String(data) }),
    );
    child.on("exit", () => {
      clearInterval(this.poll);
      send({ type: "exit" });
    });
    let last;
    this.poll = setInterval(async () => {
      try {
        const value = await fs.readFile(cwdFile, "utf8");
        if (value !== last) {
          last = value;
          if (value) send({ type: "cwd", data: value });
        }
        if (this.pendingCwd) {
          const request = JSON.parse(
            await fs.readFile(cwdFile + ".ready", "utf8"),
          );
          if (request === true) {
            const destination = this.pendingCwd;
            this.pendingCwd = null;
            await fs.writeFile(cwdFile + ".ready", "false");
            // A readline binding changes cwd without replacing a half-typed line.
            await fs.writeFile(cwdFile + ".request", destination);
            this.write({ type: "navigate" });
          }
        }
      } catch {}
    }, 100);
  }
  write(data) {
    if (!this.child.killed && this.child.stdin.writable)
      this.child.stdin.write(JSON.stringify(data) + "\n");
  }
  cd(directory) {
    this.pendingCwd = directory;
  }
  close() {
    clearInterval(this.poll);
    this.child.kill();
  }
}

async function openTerminal(directory, profile, id, send) {
  const cwdFile = path.join(profile, `terminal-${id}`);
  const rcfile = cwdFile + ".bashrc";
  const q = quote(cwdFile);
  // DEBUG marks the shell busy before a command, PROMPT_COMMAND marks it ready.
  const rc = `[[ -f ~/.bashrc ]] && source ~/.bashrc
__yhwh_state=${q}
__yhwh_cd() {
  local destination
  if [[ -f "$__yhwh_state.request" ]]; then
    IFS= read -r -d '' destination < "$__yhwh_state.request" || :
    builtin cd -- "$destination"
    rm -f -- "$__yhwh_state.request"
  fi
  printf '%s' "$PWD" > "$__yhwh_state"
}
trap 'printf false > "$__yhwh_state.ready"' DEBUG
__yhwh_prompt() { __yhwh_cd; printf true > "$__yhwh_state.ready"; }
__yhwh_readline_cd() { __yhwh_cd; printf true > "$__yhwh_state.ready"; }
bind -x '"\\e[99~":__yhwh_readline_cd'
PROMPT_COMMAND+=(__yhwh_prompt)
printf '%s' "$$" > "$__yhwh_state.pid"
PS1='\\[\\e[38;5;180m\\]𐤉 \\[\\e[38;5;110m\\]\\w \\[\\e[0m\\]\\$ '
`;
  await fs.writeFile(rcfile, rc, { mode: 0o600 });
  return new Terminal(
    spawn(
      "python3",
      ["-u", path.join(__dirname, "terminal.py"), directory, rcfile],
      { stdio: ["pipe", "pipe", "pipe"] },
    ),
    cwdFile,
    send,
  );
}
module.exports = { openTerminal };
