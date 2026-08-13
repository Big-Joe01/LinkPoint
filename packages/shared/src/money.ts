// Money helpers — integer minor-units for safe arithmetic.
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function pct(amountMinor: number, percentage: number): number {
  return Math.round((amountMinor * percentage) / 100);
}
