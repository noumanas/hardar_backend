import { aedToFils, divideRoundHalfUp, filsToAed } from './money.js';

describe('money', () => {
  it('converts between AED and integer fils', () => {
    expect(aedToFils(1500)).toBe(150_000n);
    expect(aedToFils(12.34)).toBe(1234n);
    expect(filsToAed(675_822n)).toBe(6758.22);
  });

  it.each([
    [1n, 2n, 1n], // 0.5 rounds up
    [5n, 3n, 2n], // 1.67
    [4n, 3n, 1n], // 1.33
    [0n, 7n, 0n],
  ])('divideRoundHalfUp(%s, %s) = %s', (numerator, denominator, expected) => {
    expect(divideRoundHalfUp(numerator, denominator)).toBe(expected);
  });

  it('rejects a non-positive denominator and a negative numerator', () => {
    expect(() => divideRoundHalfUp(1n, 0n)).toThrow(RangeError);
    expect(() => divideRoundHalfUp(-1n, 2n)).toThrow(RangeError);
  });
});
