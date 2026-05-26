/** Safely coerce an Express req.query value to string | undefined */
export function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val || undefined;
  if (Array.isArray(val) && typeof val[0] === 'string') return (val[0] as string) || undefined;
  return undefined;
}
