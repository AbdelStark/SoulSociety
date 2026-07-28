export function shortHex(value: string, edges = 8): string {
  return value.length <= edges * 2 + 1
    ? value
    : `${value.slice(0, edges)}…${value.slice(-edges)}`;
}
