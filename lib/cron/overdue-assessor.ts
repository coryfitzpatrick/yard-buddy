import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  today: Date = new Date()
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

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
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
  });

  const text = (message.content[0] as Anthropic.TextBlock).text.trim();
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/^[^[{]*/s, "")
    .trim();

  return JSON.parse(cleaned) as OverdueAssessment[];
}
