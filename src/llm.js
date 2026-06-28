import { execFile } from "node:child_process";

// Talks to Claude Code in headless print mode. Auth comes from the environment:
//   - CLAUDE_CODE_OAUTH_TOKEN  -> uses your Claude Max/Pro subscription (no API billing)
//   - ANTHROPIC_API_KEY        -> uses the pay-per-use API instead
// Either one works with the exact same code, so switching is just an env change.

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export function llmConfigured() {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/**
 * Single-turn completion. `system` fully replaces Claude Code's default prompt
 * (so it's a pure persona chat, not a coding assistant). Returns the reply text.
 * Args are passed via execFile (no shell), so user content can't be injected.
 */
export function chat({ system, prompt, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      prompt,
      "--system-prompt",
      system,
      "--model",
      MODEL,
      "--output-format",
      "json",
    ];

    execFile(
      CLAUDE_BIN,
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error((stderr || "").trim() || err.message));
        }
        try {
          const json = JSON.parse(stdout);
          if (json.is_error) return reject(new Error(json.result || "Claude returned an error"));
          resolve((json.result ?? "").trim());
        } catch (e) {
          reject(new Error(`Could not parse Claude output: ${e.message}`));
        }
      },
    );
  });
}
