<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codebase knowledge graph (Graphify)

This repo ships with a committed knowledge graph at `graphify-out/` that maps source code, schema, docs, and infrastructure into a queryable graph. Use it for orientation — querying the graph is significantly faster than grepping when you need to understand cross-cutting concerns (which routes touch billing? what depends on `User.planStatus`? what's the shape of the analyze pipeline?).

**Rebuild after a major change** (anything that shifts module boundaries, adds/removes models, restructures routes):

```bash
npm run graphify:rebuild
```

That command requires the `graphify` CLI on PATH (`pipx install graphifyy` or `uv tool install graphifyy`; see https://graphify.net). The artifact regenerates in place; commit the diff alongside the code change so the graph stays accurate for the next session.

`.graphifyignore` lists what's excluded from the graph (lockfiles, build output, binary assets). Add new excludes there, not in `.gitignore`.
