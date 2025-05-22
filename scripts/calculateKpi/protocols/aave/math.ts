// Math utils for Aave precision calculations
// https://github.com/aave/aave-protocol/blob/4b4545fb583fd4f400507b10f3c3114f45b8a037/contracts/libraries/WadRayMath.sol#L47-L55

export const RAY = BigInt('1000000000000000000000000000') // 1e27
const HALF_RAY = RAY / 2n

export function rayMul(a: bigint, b: bigint): bigint {
  return (a * b + HALF_RAY) / RAY
}

export function rayDiv(a: bigint, b: bigint): bigint {
  const halfB = b / 2n
  return (a * RAY + halfB) / b
}
