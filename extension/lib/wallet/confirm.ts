// Uniform random integer in [0, max), from a cryptographically secure source.
function randomInt(max: number): number {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  while (true) {
    crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value === undefined) {
      throw new Error('Random source failed');
    }
    if (value < limit) {
      return value % max;
    }
  }
}

export function pickConfirmationIndices(total: number, count: number): number[] {
  if (!Number.isInteger(total) || !Number.isInteger(count) || count < 1 || count > total) {
    throw new Error('Invalid confirmation request');
  }
  const positions = Array.from({ length: total }, (_, i) => i);
  // Partial Fisher–Yates shuffle: randomize only the first `count` slots.
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(total - i);
    const a = positions[i];
    const b = positions[j];
    if (a === undefined || b === undefined) {
      throw new Error('Shuffle index out of range');
    }
    positions[i] = b;
    positions[j] = a;
  }
  return positions.slice(0, count).sort((a, b) => a - b);
}

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

export function checkConfirmation(
  words: string[],
  indices: number[],
  answers: string[],
): boolean {
  if (indices.length === 0 || answers.length !== indices.length) {
    return false;
  }
  return indices.every((index, n) => {
    // A missing answer counts as empty, and empty is always wrong.
    const answer = normalize(answers[n] ?? '');
    return answer !== '' && answer === words[index];
  });
}