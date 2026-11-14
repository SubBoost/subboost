const BUILTIN_POLICY_TARGETS = ["DIRECT", "REJECT"];

function normalizePolicyTarget(target: unknown): string {
  return typeof target === "string" ? target.trim() : "";
}

export function uniquePolicyTargets(targets: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const normalized = normalizePolicyTarget(target);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export function createPolicyTargetResolver(options?: {
  availablePolicyTargets?: string[];
  fallbackPolicyTarget?: string;
}) {
  const availableTargets = Array.isArray(options?.availablePolicyTargets)
    ? new Set(uniquePolicyTargets(options.availablePolicyTargets))
    : null;
  const fallback = normalizePolicyTarget(options?.fallbackPolicyTarget);

  return (target: string): string => {
    const normalized = normalizePolicyTarget(target);
    if (!availableTargets) return normalized;
    if (normalized && availableTargets.has(normalized)) return normalized;
    if (fallback && availableTargets.has(fallback)) return fallback;
    return "DIRECT";
  };
}

export function chooseFallbackPolicyTarget(candidates: unknown[], availablePolicyTargets: string[]): string {
  const availableTargets = new Set(uniquePolicyTargets(availablePolicyTargets));

  for (const candidate of candidates) {
    const normalized = normalizePolicyTarget(candidate);
    if (normalized && availableTargets.has(normalized)) return normalized;
  }

  return "DIRECT";
}

export function withBuiltinPolicyTargets(targets: unknown[]): string[] {
  return uniquePolicyTargets([...targets, ...BUILTIN_POLICY_TARGETS]);
}

export function buildPolicyTargetContext(groupNames: unknown[], nodeNames: unknown[]) {
  const availablePolicyTargets = withBuiltinPolicyTargets([...groupNames, ...nodeNames]);
  return {
    availablePolicyTargets,
    fallbackPolicyTarget: chooseFallbackPolicyTarget([groupNames[0], nodeNames[0], "DIRECT"], availablePolicyTargets),
  };
}
