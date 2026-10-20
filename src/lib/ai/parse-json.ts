/** Parse a JSON object returned by an LLM, tolerating markdown fences or brief surrounding text. */
export function parseAiJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    // Some providers add a short preface despite being asked for JSON. Locate
    // the first complete object while respecting braces inside JSON strings.
    const start = unfenced.indexOf("{");
    if (start < 0) throw new SyntaxError("AI response did not contain a JSON object.");

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < unfenced.length; i += 1) {
      const char = unfenced[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return JSON.parse(unfenced.slice(start, i + 1));
      }
    }
    throw new SyntaxError("AI response contained incomplete JSON.");
  }
}
