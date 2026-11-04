// A run of letters, digits and underscores, a run of whitespace, an emoji with its modifiers and the
// emoji joined to it, or any other character.
const wordPattern =
  /[\p{L}\p{M}\p{N}_]+|\s+|\p{RI}{2}|[#*]\uFE0F?\u20E3|\p{ExtPict}[\p{Gr_Ext}\p{EMod}]*(?:\u200D\p{ExtPict}[\p{Gr_Ext}\p{EMod}]*)*|./gu;

// The words that make up the text, in order: what lines are compared in.
export function wordsOf(text: string): string[] {
  return text.match(wordPattern) ?? [];
}
