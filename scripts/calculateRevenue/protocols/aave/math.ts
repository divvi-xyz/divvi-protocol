export const RAY = BigInt('1000000000000000000000000000') // 1e27
const HALF_RAY = RAY / 2n

export function rayMul(a: bigint, b: bigint): bigint {
  return (a * b + HALF_RAY) / RAY
}

export function rayDiv(a: bigint, b: bigint): bigint {
  const halfB = b / 2n
  return (a * RAY + halfB) / b
}
