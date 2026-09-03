export function nextNumericId(ids: Iterable<string>): string {
  let max = 0
  for (const id of ids) {
    const n = Number(id)
    if (Number.isInteger(n) && n > max) max = n
  }
  return String(max + 1)
}

export function asGanttId(id: string): number | string {
  const n = Number(id)
  if (Number.isInteger(n) && String(n) === id) return n
  return id
}

export function fromGanttId(id: string | number): string {
  return String(id)
}
