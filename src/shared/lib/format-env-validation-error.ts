export interface EnvValidationIssue {
  readonly path?: readonly unknown[];
  readonly message: string;
}

function pathSegmentName(part: unknown): string {
  if (typeof part === "string" || typeof part === "number" || typeof part === "symbol") {
    return String(part);
  }
  if (part && typeof part === "object" && "key" in part) {
    return String((part as { key: unknown }).key);
  }
  return "";
}

function issueVarName(issue: EnvValidationIssue): string {
  const skipped = new Set(["server", "client", "SERVER", "CLIENT"]);
  const path = (issue.path ?? []).map(pathSegmentName).filter((part) => part.length > 0 && !skipped.has(part));
  return path[path.length - 1] ?? "(unknown)";
}

/**
 * Build a build-log-friendly message that names every missing or invalid env var.
 * Validation itself stays in `src/env.ts`; this only formats Zod/t3-oss issues.
 */
export function formatEnvValidationError(issues: readonly EnvValidationIssue[]): string {
  const lines = issues.map((issue) => {
    const name = issueVarName(issue);
    const reason = issue.message?.trim() || "invalid";
    return `  ${name}: ${reason}`;
  });

  return ["Invalid environment variables:", ...lines].join("\n");
}
