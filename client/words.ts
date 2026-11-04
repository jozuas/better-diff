// A word, as delta's default word pattern, \w, makes one: a run of letters, marks, decimal digits,
// connectors such as underscores, and joiners.
const wordStart = /^[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}]/u;

// A word, or any other character, an emoji with its modifiers and the emoji joined to it being one,
// as a flag of two regional indicators and a keycap are.
const tokenPattern =
  /[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}]+|\p{RI}{2}|[#*]\uFE0F?\u20E3|\p{ExtPict}[\p{Gr_Ext}\p{EMod}]*(?:\u200D\p{ExtPict}[\p{Gr_Ext}\p{EMod}]*)*|./gsu;

// The words and other characters that make up the text, in order: what lines are compared in.
export function wordsOf(text: string): string[] {
  return text.match(tokenPattern) ?? [];
}

export function startsWithWord(text: string): boolean {
  return wordStart.test(text);
}
