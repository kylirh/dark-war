import assert from "node:assert/strict";
import test from "node:test";

import { validateCommitMessage } from "../scripts/validate-commit-message.mjs";

test("accepts a lowercase conventional commit subject", () => {
  assert.deepEqual(validateCommitMessage("feat(ui): show player alerts\n"), []);
});

test("ignores editor comments and accepts a lowercase body", () => {
  assert.deepEqual(
    validateCommitMessage(
      "fix: dismiss stale alerts\n\nkeep the newest alerts visible\n# comment",
    ),
    [],
  );
});

test("rejects uppercase commit content", () => {
  assert.match(
    validateCommitMessage("Feat(ui): Show player alerts")[0],
    /lowercase/u,
  );
});

test("rejects emojis", () => {
  assert.match(
    validateCommitMessage("fix: add alert feedback 🙂")[0],
    /emojis/u,
  );
});

test("rejects subjects that are 150 characters or longer", () => {
  const subject = `fix: ${"a".repeat(145)}`;
  assert.equal(subject.length, 150);
  assert.match(validateCommitMessage(subject)[0], /fewer than 150 characters/u);
});

test("rejects subjects that are not conventional commits", () => {
  assert.match(
    validateCommitMessage("please fix the alerts")[0],
    /conventional commits syntax/u,
  );
});
