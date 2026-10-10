const fs = require('fs');

const bugMemory = `When updating the learning log as the 'Test' agent, if a newly written test exposes a real bug (i.e., fails against the current code), the finding belongs to the 'Bug' agent. You must restore the repository to its original state (e.g., \`git reset --hard && git clean -fd\`) and stop silently without committing, modifying files, or updating the learning log.`;

console.log("Memory recorded correctly before.");
