<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codebase knowledge graph (Graphify)

This repo ships with a committed knowledge graph at `graphify-out/` that maps source code, schema, docs, and infrastructure into a queryable graph. The Graphify skill is registered globally on this machine and is available via the Skill tool.

## When to use it (rule)

For any **cross-cutting question** — anything that crosses files, modules, or concerns — invoke the graphify skill BEFORE falling back to grep, file reads, or the Explore agent. The graph is faster and more accurate for these questions, and the only way it earns its keep is if it's the default first move.

Cross-cutting question patterns (use the graph):

- "What touches X?" / "Where is Y used?" — e.g. *what routes touch billing*, *what depends on `User.planStatus`*, *what reads `analysisQuotaResetAt`*.
- "What's the shape of X?" — e.g. *what's the analyze pipeline*, *how do schedules flow from yard to email*.
- "What are all the X?" — e.g. *all webhook handlers*, *all places we call Stripe*, *all email senders*.
- Orientation at the start of a new task that touches an area you haven't worked in yet.

Targeted lookups (grep is still fine):

- A specific function or symbol you already know the name of.
- A specific file you already know the path of.
- A literal string match (error messages, env var names).

If you're not sure, default to the graph — being wrong toward "queried the graph unnecessarily" costs a tool call; being wrong toward "grepped a cross-cutting question into a partial answer" costs the user's trust.

## Rebuild

Rebuild after any structural change (module boundaries shift, models added/removed, routes restructured, major refactor):

```bash
npm run graphify:rebuild
```

That command requires the `graphify` CLI on PATH (`pipx install graphifyy` or `uv tool install graphifyy`; see https://graphify.net). The artifact regenerates in place; commit the diff alongside the code change so the graph stays accurate for the next session.

`.graphifyignore` lists what's excluded from the graph (lockfiles, build output, binary assets). Add new excludes there, not in `.gitignore`.
