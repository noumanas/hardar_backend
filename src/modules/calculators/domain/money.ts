/** Money is handled in integer fils (1 AED = 100 fils) so no floating-point error reaches a worker. */
const FILS_PER_AED = 100;

export const aedToFils = (aed: number): bigint => BigInt(Math.round(aed * FILS_PER_AED));

export const filsToAed = (fils: bigint): number => Number(fils) / FILS_PER_AED;

/** Exact `numerator / denominator`, rounded half-up to whole fils. Both must be non-negative. */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  if (numerator < 0n) throw new RangeError('numerator must not be negative');
  return (numerator * 2n + denominator) / (denominator * 2n);
}
