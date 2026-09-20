echo "" >> .jules/scribe.md
echo "## $(date +%Y-%m-%d) - Document delta compression null assignment rule" >> .jules/scribe.md
echo "" >> .jules/scribe.md
echo "**What was found:** The memory explicitly states: \"In Dark War state synchronization (\`src/net/state-delta.ts\`), when an optional field is cleared, \`computeStateDelta\` must assign \`null\` to the delta (e.g., \`delta.field = next.field ?? null;\`) rather than \`undefined\`.\" However, this constraint was missing from the documentation." >> .jules/scribe.md
echo "" >> .jules/scribe.md
echo "**Action:** Added a TSDoc comment to \`computeStateDelta\` in \`src/net/state-delta.ts\` explaining that clearing an optional field requires assigning \`null\` rather than \`undefined\`, and explaining why (because \`JSON.stringify\` drops \`undefined\` keys entirely, causing the client to inherit stale values)." >> .jules/scribe.md
echo "" >> .jules/scribe.md
echo "**Prevention:** Future developers modifying \`computeStateDelta\` will see the constraint in IntelliSense and avoid the trap of assigning \`undefined\` when an optional field is removed." >> .jules/scribe.md
