# Heartbeat

> Periodic self-initiated check-ins and background tasks.
> The agent reads this file on each heartbeat tick and decides what to act on.

## Schedule

- [ ] Every morning (8am-10am): Review workspace and summarize recent activity
- [ ] Every evening (6pm-8pm): Write a daily summary to MEMORY.md

- [ ] Every heartbeat tick: Run proactive_monitoring to check git status, tests, and build health. Report only if issues are found.
## Notes

- Schedule expressions are interpreted by the agent — use natural language.
- Edit this file anytime. Changes take effect on the next heartbeat tick.
