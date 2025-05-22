export function calculateOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  return Math.max(0, overlapEnd - overlapStart)
}

export function createSegments<T, R>(
  snapshots: T[],
  transformFn: (current: T, next: T) => R,
): R[] {
  const segments: R[] = []

  for (let i = 0; i < snapshots.length - 1; i++) {
    const current = snapshots[i]
    const next = snapshots[i + 1]
    segments.push(transformFn(current, next))
  }

  return segments
}
