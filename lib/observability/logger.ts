// lib/observability/logger.ts
import { Logger, AxiomJSTransport, ConsoleTransport, type Transport } from "@axiomhq/logging";
import { createAxiomRouteHandler, nextJsFormatters } from "@axiomhq/nextjs";
import { getAxiomClient, getAxiomDataset } from "./client";

const NOOP_TRANSPORT: Transport = {
  log: () => {},
  flush: async () => {},
};

// Intentionally process-lifetime: AXIOM_TOKEN is read from env at boot and
// won't appear mid-process, so a single warning per process is the desired UX.
let warnedMissingToken = false;

export function buildTransports(): Transport[] {
  if (process.env.NODE_ENV === "test") {
    return [NOOP_TRANSPORT];
  }

  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | undefined
  const isLocalDev = process.env.NODE_ENV === "development" && !vercelEnv;
  if (isLocalDev) {
    return [new ConsoleTransport({ prettyPrint: true })];
  }

  const axiom = getAxiomClient();
  if (!axiom) {
    if (!warnedMissingToken) {
      console.warn(
        "[observability] AXIOM_TOKEN not set, logs going to console only. Set the env var on Vercel to enable Axiom ingest.",
      );
      warnedMissingToken = true;
    }
    return [new ConsoleTransport()];
  }

  const axiomTransport = new AxiomJSTransport({ axiom, dataset: getAxiomDataset() });

  // Preview deploys get both — Axiom (tagged env: "preview") for dashboards
  // plus console for `vercel logs` debugging on PR branches.
  if (vercelEnv === "preview") {
    return [axiomTransport, new ConsoleTransport()];
  }

  return [axiomTransport];
}

export interface EnvScope {
  env: string;
  service: "yard-analyzer";
  version: string;
}

export function buildEnvScope(): EnvScope {
  return {
    env:
      process.env.VERCEL_ENV ??
      (process.env.NODE_ENV === "development" ? "development" : "unknown"),
    service: "yard-analyzer",
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  };
}

// buildTransports() always returns at least one element; assert the non-empty
// tuple shape Logger requires.
const _transports = buildTransports() as [Transport, ...Transport[]];

export const logger = new Logger({
  transports: _transports,
  formatters: nextJsFormatters,
});

// withAxiom's `store` callback injects request-scoped fields onto every log
// line emitted inside the wrapped handler. Common scope (env/service/version)
// lives there too so it lands on uncaught-exception logs the wrapper produces.
export const withAxiom = createAxiomRouteHandler(logger, {
  store: () => buildEnvScope(),
});
