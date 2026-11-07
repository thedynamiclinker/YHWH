const fs = require("node:fs/promises");
const path = require("node:path");

async function createCodex(directory) {
  const executable = path.join(directory, "fake codex");
  const requests = path.join(directory, "codex-requests.jsonl");
  const response = path.join(directory, "codex-response.json");
  await fs.writeFile(response, "{}");
  await fs.writeFile(executable, `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const messages = JSON.parse(prompt.slice(prompt.indexOf("\\n\\n") + 2));
  const schemaPath = args.includes("--output-schema") ? args[args.indexOf("--output-schema") + 1] : null;
  const schema = schemaPath ? JSON.parse(fs.readFileSync(schemaPath, "utf8")) : null;
  const output = args[args.indexOf("--output-last-message") + 1];
  fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ args, cwd: process.cwd(), messages, schema, output }) + "\\n");
  const behavior = JSON.parse(fs.readFileSync(${JSON.stringify(response)}, "utf8"));
  if (behavior.exit) { console.error("Please log in again."); process.exit(behavior.exit); }
  if (behavior.missing) return;
  let answer = "Let me come down and inspect that diff.";
  if (schema?.properties.reactions) {
    const { company } = JSON.parse(messages.at(-1).content);
    answer = JSON.stringify({ reactions: company.people.map((p) => ({
      personId: p.id, content: "Show evidence for this change.", verdict: "concern",
    })) });
  } else if (schema) {
    answer = JSON.stringify({ chat: "A small improvement for review.", mail: "Subject: Small change\\nPlease review.", forge: "Small change\\nVerification remains pending." });
  }
  console.log("Progress output must not become the answer.");
  fs.writeFileSync(output, behavior.answer ?? answer);
});
`, { mode: 0o700 });
  return { executable, requests, response };
}

module.exports = { createCodex };
