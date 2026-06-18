import { callClaude, type AiCallCtx } from "@/lib/ai/usage";

export interface OverdueTaskInput {
  id: string;
  title: string;
  scheduledEnd: Date;
  grassType: string;
}

export interface OverdueAssessment {
  taskId: string;
  stillWorthDoing: boolean;
  overdueNote: string;
}

export async function assessOverdueTasks(
  tasks: OverdueTaskInput[],
  weatherSummary: string,
  ctx: AiCallCtx,
  today: Date = new Date(),
): Promise<OverdueAssessment[]> {
  if (tasks.length === 0) return [];

  const todayStr = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const grassType = tasks[0].grassType.replace(/_/g, " ");

  const taskList = tasks
    .map((t, i) => {
      const closedOn = t.scheduledEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${i + 1}. Task ID: ${t.id} | Title: "${t.title}" | Window closed: ${closedOn}`;
    })
    .join("\n");

  const message = await callClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `These lawn care tasks are past their scheduled window. For each task, decide if it is still worth doing now and write a one-sentence note explaining why. Do not use em dashes.

Today: ${todayStr}
Weather: ${weatherSummary}
Grass type: ${grassType}

Tasks:
${taskList}

Return a JSON array only:
[
  {
    "taskId": "<exact task ID from above>",
    "stillWorthDoing": true,
    "overdueNote": "Late but still effective if applied this week."
  },
  {
    "taskId": "<exact task ID>",
    "stillWorthDoing": false,
    "overdueNote": "Window closed. Pre-emergent will not work now. Wait until fall."
  }
]`,
      },
    ],
  }, ctx);

  const firstBlock = message.content[0];
  const text = (firstBlock.type === "text" ? firstBlock.text : "").trim();
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    console.error("assessOverdueTasks: no JSON array found in response");
    return [];
  }
  const cleaned = text.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned) as OverdueAssessment[];
  } catch (err) {
    console.error("assessOverdueTasks: JSON.parse failed:", err);
    return [];
  }
}
