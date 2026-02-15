// Purpose: isolate core step list mutations from UI components.
// Inputs: current steps array + mutation intent. Outputs: immutable updated steps arrays.
export function resequenceSteps<T extends { stepIndex?: number }>(steps: T[]): T[] {
  return steps.map((step, idx) => ({ ...step, stepIndex: idx + 1 }));
}

export function patchStepById<T extends { id: string }>(
  steps: T[],
  stepId: string,
  patcher: (step: T) => T
): T[] {
  return steps.map((step) => (step.id === stepId ? patcher(step) : step));
}

export function moveStepInList<T extends { id: string; stepIndex?: number }>(
  steps: T[],
  stepId: string,
  direction: -1 | 1
): T[] {
  const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) {
    return steps;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= steps.length) {
    return steps;
  }
  const next = [...steps];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return resequenceSteps(next);
}

export function deleteStepById<T extends { id: string; stepIndex?: number }>(steps: T[], stepId: string): T[] {
  return resequenceSteps(steps.filter((step) => step.id !== stepId));
}

