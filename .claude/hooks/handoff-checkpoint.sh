#!/bin/bash
# Autonomous handoff checkpoint hook.
# Fires on Stop. Counts assistant turns per session_id. When count reaches 30
# (roughly ~60% of a 200K context), emits an additionalContext system reminder
# instructing Claude to write docs/session-handoff.md so the next session can
# resume cleanly. Combined with the project memory `feedback_context_management.md`.
#
# Counter file: /tmp/claude-handoff-counter-<session_id>
# Emits once at the threshold; subsequent turns past 30 emit nothing further
# (the assumption is that the handoff was written and the user will /compact).
#
# To reset: rm /tmp/claude-handoff-counter-<session_id>
# To change threshold: edit the integer below.

set -e

THRESHOLD=30
in=$(cat)
sid=$(echo "$in" | jq -r '.session_id // "unknown"' 2>/dev/null)
[ -z "$sid" ] && exit 0

f="/tmp/claude-handoff-counter-${sid}"
c=$(cat "$f" 2>/dev/null || echo 0)
c=$((c + 1))
echo "$c" > "$f"

if [ "$c" -eq "$THRESHOLD" ]; then
  jq -nc --argjson n "$c" '{
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: ("[Autonomous handoff checkpoint] You have completed ~\($n) assistant turns this session — approximately ~60% context usage estimate. Per the feedback memory `feedback_context_management.md`, write `docs/session-handoff.md` now so the next session can resume cleanly. Capture: current goal/status, last validation run numbers, recent commits + uncommitted changes, in-flight tasks, key files touched, concrete next step. After writing, tell the user the handoff is ready and recommend they issue /compact or /clear. This reminder fires once per session; you will not see it again.")
    }
  }'
fi

exit 0
