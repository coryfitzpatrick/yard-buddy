import { registerOTel } from "@axiomhq/nextjs";

export function register() {
  registerOTel({ serviceName: "yard-analyzer" });
}
