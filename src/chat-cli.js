import "dotenv/config";
import { buildSystem, buildPrompt } from "./persona.js";
import { chat, llmConfigured } from "./llm.js";

// Local tester for the bot's persona — iterate on persona.md without Discord.
//
//   node src/chat-cli.js "what's a good cafe near BGC?"
//   node src/chat-cli.js --as eun "rate my taste in anime"
//   node src/chat-cli.js --as Regor "i'm tired today"

const argv = process.argv.slice(2);
let speaker = "Regor";
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--as") speaker = argv[++i];
  else words.push(argv[i]);
}
const message = words.join(" ").trim();

if (!message) {
  console.error('Usage: node src/chat-cli.js [--as <name>] "<message>"');
  process.exit(1);
}
if (!llmConfigured()) {
  console.error("No CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) set in .env — run `claude setup-token` first.");
  process.exit(1);
}

console.log(`(${speaker} → bot)  ${message}\n`);
try {
  const reply = await chat({ system: buildSystem(speaker), prompt: buildPrompt([], speaker, message) });
  console.log(reply);
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
