export const TOKEN_SYMBOL_MAX = 11;
export const TOKEN_NAME_MAX = 40;
export const UNKNOWN_TOKEN = 'Unknown token';

// A token's symbol and name are chosen by whoever deployed the contract, so they
// are attacker-controlled text. Before any of it is shown or stored: every
// format character is removed first (category Cf: the bidi controls
// U+202A-202E and U+2066-2069, the zero-width characters U+200B-200F, the word
// joiner U+2060 and the byte-order mark U+FEFF). This must come before the
// whitespace step because JavaScript's \s also matches U+FEFF. Then whitespace
// of every kind (tabs, newlines, line and paragraph separators) becomes a plain
// space and any remaining control character is removed. Whitespace is
// collapsed and trimmed, the result is cut to `max` code points, and an empty
// result reads "Unknown token".
export function sanitizeTokenText(raw: string, max: number): string {
  const noFormat = raw.replace(/\p{Cf}/gu, '');
  const spaced = noFormat.replace(/\s+/gu, ' ');
  const noControl = spaced.replace(/\p{Cc}/gu, '');
  const collapsed = noControl.replace(/ +/g, ' ').trim();
  const cut = [...collapsed].slice(0, max).join('').trim();
  return cut === '' ? UNKNOWN_TOKEN : cut;
}

export function sanitizeTokenSymbol(raw: string): string {
  return sanitizeTokenText(raw, TOKEN_SYMBOL_MAX);
}

export function sanitizeTokenName(raw: string): string {
  return sanitizeTokenText(raw, TOKEN_NAME_MAX);
}
