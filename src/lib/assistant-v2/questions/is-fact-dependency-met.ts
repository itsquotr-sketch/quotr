import { getAnswerValue } from "@/lib/question-keys";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";
import type { FactDependency } from "@/lib/scopes/types";

const UNRESOLVED_PARENT_VALUES = new Set(["", "unknown", "not_sure"]);

function normalizeDependencyValue(value: string | boolean): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value).trim().toLowerCase();
}

function resolveFactKey(scopeTypeKey: string, key: string): string {
  if (key.includes(".")) return key;
  const scope = getScopeByWorkAreaType(scopeTypeKey);
  if (!scope) return key;
  const prefix = scope.id;
  return `${prefix}.${key}`;
}

export function getDependenciesForFact(
  scopeTypeKey: string,
  factKey: string
): FactDependency[] {
  const deps: FactDependency[] = [];
  const scope = getScopeByWorkAreaType(scopeTypeKey);
  const fact = scope
    ? getAllFactsForScope(scope).find((row) => row.key === factKey)
    : undefined;

  if (fact?.dependsOn) {
    deps.push(fact.dependsOn);
  }

  const template = getCanonicalScopeTemplateByWorkAreaType(scopeTypeKey);
  for (const rule of template?.followUps.dependentQuestions ?? []) {
    const askKey = resolveFactKey(scopeTypeKey, rule.askFactKey);
    if (askKey !== factKey) continue;

    const whenValues = Array.isArray(rule.whenValue)
      ? rule.whenValue
      : [rule.whenValue];

    deps.push({
      factKey: rule.whenFactKey,
      operator: whenValues.length > 1 ? "in" : "equals",
      value: whenValues.length > 1 ? whenValues : whenValues[0]!,
    });
  }

  return deps;
}

export function isFactDependencyMet(
  scopeTypeKey: string,
  factKey: string,
  answers: Record<string, string>
): boolean {
  const deps = getDependenciesForFact(scopeTypeKey, factKey);
  if (deps.length === 0) return true;

  return deps.every((dep) => {
    const actual =
      getAnswerValue(answers, dep.factKey)?.trim().toLowerCase() ?? "";

    if (UNRESOLVED_PARENT_VALUES.has(actual)) {
      return false;
    }

    if (dep.operator === "in") {
      const values = (Array.isArray(dep.value) ? dep.value : [dep.value]).map(
        normalizeDependencyValue
      );
      return values.includes(actual);
    }

    const expected = normalizeDependencyValue(
      dep.value as string | boolean
    );

    if (dep.operator === "not_equals") {
      return actual !== expected;
    }

    return actual === expected;
  });
}
