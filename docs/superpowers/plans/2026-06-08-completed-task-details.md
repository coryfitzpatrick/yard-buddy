# Completed Task Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand completed task cards in `TaskList` to show full details (description, product, application rate, spreader setting, scheduled dates) instead of only a strikethrough title.

**Architecture:** Pure UI change in `components/dashboard/TaskList.tsx`. All task fields are already fetched by every page query; they just aren't rendered for completed tasks. Replace the minimal completed-task card with a detail-rich layout that mirrors pending task cards but uses muted/faded styling.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react, Vitest + Testing Library.

---

## File Structure

**Modified:**
- `components/dashboard/TaskList.tsx` — expand completed task card rendering (~lines 346–368)
- `components/dashboard/__tests__/TaskList.test.tsx` — add completed-task detail tests

---

### Task 1: Expand completed task cards

**Files:**
- Modify: `components/dashboard/TaskList.tsx` (lines 346–368, completed task map)
- Modify: `components/dashboard/__tests__/TaskList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `components/dashboard/__tests__/TaskList.test.tsx` after the existing two tests:

```typescript
describe("TaskList completed task details", () => {
  const completedTask = {
    id: "c1",
    title: "Apply pre-emergent",
    description: "Apply before soil temps reach 55°F",
    priority: "high",
    status: "completed",
    scheduledStart: "2026-03-01T00:00:00.000Z",
    scheduledEnd: "2026-03-15T00:00:00.000Z",
    overdueNote: null,
    stillWorthDoing: null,
    product: "Scotts Halts",
    applicationRate: "2.87 lbs / 1000 sq ft",
    spreaderSetting: "3",
    taskMode: null,
    productSearchQuery: null,
  };

  it("shows description on a completed task", () => {
    render(<TaskList tasks={[completedTask]} />);
    expect(screen.getByText("Apply before soil temps reach 55°F")).toBeInTheDocument();
  });

  it("shows product and application rate on a completed task", () => {
    render(<TaskList tasks={[completedTask]} />);
    expect(screen.getByText("Scotts Halts")).toBeInTheDocument();
    expect(screen.getByText(/2\.87 lbs/)).toBeInTheDocument();
  });

  it("shows spreader setting on a completed task", () => {
    render(<TaskList tasks={[completedTask]} />);
    expect(screen.getByText(/Spreader:.*3/)).toBeInTheDocument();
  });

  it("still renders undo button on completed task", () => {
    render(<TaskList tasks={[completedTask]} />);
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run components/dashboard/__tests__/TaskList.test.tsx
```

Expected: 4 new tests FAIL — "Apply before soil temps..." not found, product/rate/spreader not found.

- [ ] **Step 3: Replace the completed task card rendering in `TaskList.tsx`**

Find the completed tasks section (around lines 346–368). It currently reads:

```tsx
{completed.length > 0 && (
  <details className="mt-4">
    <summary className="text-sm text-gray-500 cursor-pointer font-medium">
      {completed.length} completed task{completed.length > 1 ? "s" : ""}
    </summary>
    <div className="space-y-2 mt-2">
      {completed.map((task) => (
        <Card key={task.id} className="opacity-60">
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <span className="text-sm line-through text-gray-400 flex-1">{task.title}</span>
            <button
              onClick={() => patchTask(task.id, "pending")}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  </details>
)}
```

Replace it with:

```tsx
{completed.length > 0 && (
  <details className="mt-4">
    <summary className="text-sm text-gray-500 cursor-pointer font-medium">
      {completed.length} completed task{completed.length > 1 ? "s" : ""}
    </summary>
    <div className="space-y-2 mt-2">
      {completed.map((task) => (
        <Card key={task.id} className="opacity-60">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-base line-through text-gray-400">{task.title}</span>
                  <button
                    onClick={() => patchTask(task.id, "pending")}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                  </button>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{task.description}</p>
                {task.product && (
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-400">
                    <Package className="w-3.5 h-3.5 shrink-0" />
                    <span>{task.product}</span>
                    {task.applicationRate && (
                      <span className="text-gray-300">· {task.applicationRate}</span>
                    )}
                    {task.productSearchQuery && (
                      <a
                        href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(task.productSearchQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Shop"
                        className="ml-auto shrink-0 text-gray-300 hover:text-green-600 transition-colors"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
                {task.spreaderSetting && (
                  <p className="text-xs text-gray-400 mt-1">Spreader: {task.spreaderSetting}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </details>
)}
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```bash
npx vitest run components/dashboard/__tests__/TaskList.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all 100 tests passing.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/TaskList.tsx components/dashboard/__tests__/TaskList.test.tsx
git commit -m "feat: show full details on completed task cards"
```
