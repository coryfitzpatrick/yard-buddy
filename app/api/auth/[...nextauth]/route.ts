import { handlers } from "@/lib/auth";
import { withAxiom } from "@/lib/observability/logger";

export const GET = withAxiom(handlers.GET);
export const POST = withAxiom(handlers.POST);
