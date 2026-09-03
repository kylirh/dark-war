#!/usr/bin/env node
/**
 * Validates commit messages against Dark War's repository commit policy.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const MAX_SUBJECT_LENGTH = 149;
const CONVENTIONAL_SUBJECT_PATTERN =
  /^[a-z][a-z0-9-]*(?:\([a-z0-9][a-z0-9._/-]*\))?!?: [a-z0-9][^\r\n]*$/u;
const EMOJI_PATTERN =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{20e3}\u{fe0f}]/u;

/**
 * Returns commit-message validation errors. Git comment lines and blank lines
 * are ignored because they are editor metadata rather than commit content.
 */
export function validateCommitMessage(message) {
  const meaningfulLines = message
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  const meaningfulMessage = meaningfulLines.join("\n");
  const subject = meaningfulLines[0] ?? "";
  const errors = [];

  if (subject.length === 0) {
    errors.push("commit message must have a subject");
    return errors;
  }

  if (Array.from(subject).length > MAX_SUBJECT_LENGTH) {
    errors.push(
      `commit subject must be fewer than ${MAX_SUBJECT_LENGTH + 1} characters`,
    );
  }

  if (meaningfulMessage !== meaningfulMessage.toLowerCase()) {
    errors.push("commit message must contain only lowercase letters");
  }

  if (EMOJI_PATTERN.test(meaningfulMessage)) {
    errors.push("commit message must not contain emojis");
  }

  if (!CONVENTIONAL_SUBJECT_PATTERN.test(subject)) {
    errors.push(
      "subject must use conventional commits syntax: type(scope): description",
    );
  }

  return errors;
}

function main() {
  const messagePath = process.argv[2];
  if (!messagePath) {
    console.error("usage: validate-commit-message.mjs <commit-message-file>");
    process.exit(2);
  }

  const errors = validateCommitMessage(readFileSync(messagePath, "utf8"));
  if (errors.length === 0) {
    return;
  }

  console.error("invalid commit message:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
