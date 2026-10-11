export function normalizePhraseInput(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^#?\d+[.):]/, '').replace(/^#?\d+$/, ''))
    .filter((token) => token.length > 0)
    .join(' ');
}
