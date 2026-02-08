// Extracts the first valid JSON value (object or array) from a string.
// Useful for LLM responses that wrap JSON in extra text.
export function extractFirstJsonValue(text: string): unknown | null {
  if (!text) return null;

  const src = text.trim();

  // Some models include extra braces (schema/examples) before the real JSON.
  // We scan each possible JSON start and return the first candidate that parses.
  for (let start = 0; start < src.length; start++) {
    const first = src[start];
    if (first !== '{' && first !== '[') continue;

    const open = first;
    const close = open === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < src.length; i++) {
      const ch = src[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === open) depth++;
      if (ch === close) depth--;

      if (depth === 0) {
        const candidate = src.slice(start, i + 1).trim();
        try {
          return JSON.parse(candidate);
        } catch {
          break; // try the next start position
        }
      }
    }
  }

  return null;
}
