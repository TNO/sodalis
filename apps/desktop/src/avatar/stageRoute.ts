export function isStageRequested(search: string): boolean {
  return new URLSearchParams(search).has("stage");
}
