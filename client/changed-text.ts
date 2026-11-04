// Infers which text of a run of changes' lines changed as delta's within-line diff does, in its
// edits.rs (https://github.com/dandavison/delta, MIT licence, copyright 2020 Dan Davison).

import { operationsOf } from "./alignment";
import type { Operation } from "./alignment";
import { startsWithWord, wordsOf } from "./words";

// Where a piece of a line's text starts, and where it ends, after its last character.
export interface TextRange {
  start: number;
  end: number;
}

// The most cells the tables aligning a run's lines can have together, since filling them takes
// longer the more there are.
const cellLimit = 1_000_000;

// The operations, each with how many tokens in a row it's of.
function groupsOf(operations: readonly Operation[]): [Operation, number][] {
  const groups: [Operation, number][] = [];

  for (const operation of operations) {
    const last = groups.at(-1);

    if (last?.[0] === operation) {
      last[1] += 1;
    } else {
      groups.push([operation, 1]);
    }
  }

  return groups;
}

// A character a terminal shows two columns wide: an emoji, or a Chinese, Japanese or Korean one.
const wide =
  /[\p{Emoji_Presentation}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF01-\uFF60\uFFE0-\uFFE6]/u;

// A line's words and other characters, as delta aligns them: after an empty token if the line
// doesn't start with a word, so that its indentation is changed along with the word another line
// starts with instead.
function tokensOf(line: string): string[] {
  return startsWithWord(line) ? wordsOf(line) : ["", ...wordsOf(line)];
}

// How much text there is, for how different lines are, as delta measures it: how many columns a
// terminal shows it in, but for whitespace at its ends. A mark, a joiner or an emoji's skin tone
// combines with the character before it.
function widthOf(text: string): number {
  const characters = text.trim().match(/[^\p{M}\p{Join_Control}\p{EMod}]/gu) ?? [];

  return characters.length + characters.filter((character) => wide.test(character)).length;
}

// A line's tokens, read a group at a time, and its changed text.
class Reader {
  private readonly tokens: readonly string[];
  private token = 0;
  private at = 0;
  readonly changes: TextRange[] = [];

  constructor(tokens: readonly string[]) {
    this.tokens = tokens;
  }

  // The text of the next `count` tokens.
  textOf(count: number): string {
    return this.tokens.slice(this.token, this.token + count).join("");
  }

  // Reads the next `count` tokens, as changed or not, and gives their text.
  read(count: number, changed: boolean): string {
    const text = this.textOf(count);
    const start = this.at;
    const last = this.changes.at(-1);

    this.token += count;
    this.at += text.length;

    if (changed && last?.end === start) {
      last.end = this.at;
    } else if (changed && text !== "") {
      this.changes.push({ start, end: this.at });
    }

    return text;
  }
}

// What aligning a removed line with an added one finds: each one's changed text, and how different
// they are, from 0 for lines that only differ in whitespace to 1 for lines with nothing in common.
interface Pair {
  removed: TextRange[];
  added: TextRange[];
  distance: number;
}

// The pair the lines' tokens make. Whitespace both lines keep right after text both changed counts
// as changed too. How different the lines are is how much of their text changed, counting what they
// keep twice, once in each.
function pairOf(removedTokens: readonly string[], addedTokens: readonly string[]): Pair {
  const removed = new Reader(removedTokens);
  const added = new Reader(addedTokens);
  let changed = 0;
  let total = 0;
  // The kinds of change since the text the lines last kept.
  const since = new Set<Operation>();

  for (const [operation, count] of groupsOf(operationsOf(removedTokens, addedTokens))) {
    if (operation === "keep") {
      const width = widthOf(removed.textOf(count));
      const between = width === 0 && since.has("remove") && since.has("add");

      removed.read(count, between);
      added.read(count, between);
      total += 2 * width;
      since.clear();
    } else {
      const width = widthOf((operation === "remove" ? removed : added).read(count, true));

      changed += width;
      total += width;
      since.add(operation);
    }
  }

  return {
    removed: removed.changes,
    added: added.changes,
    distance: total === 0 ? 0 : changed / total,
  };
}

// The changed text of each of a run's removed lines and each of its added ones.
interface RunChanges {
  removed: TextRange[][];
  added: TextRange[][];
}

// The text that changed in each of a run's removed and added lines. Each removed line, in order, is
// paired with the first added line after the last one paired that's no more than `maxDistance`
// different from it, and the two have the changed text aligning them finds. Others have none, as
// have those after aligning the run's lines would take tables of more than `cellLimit` cells.
export function changedTextOf(
  removed: readonly string[],
  added: readonly string[],
  maxDistance: number,
): RunChanges {
  const changes: RunChanges = { removed: removed.map(() => []), added: added.map(() => []) };
  const addedTokens = added.map(tokensOf);
  let next = 0;
  let cells = 0;

  for (const [index, line] of removed.entries()) {
    const tokens = tokensOf(line);

    for (const [offset, candidate] of addedTokens.slice(next).entries()) {
      cells += (tokens.length + 1) * (candidate.length + 1);

      if (cells > cellLimit) {
        return changes;
      }

      const pair = pairOf(tokens, candidate);

      if (pair.distance <= maxDistance) {
        changes.removed[index] = pair.removed;
        changes.added[next + offset] = pair.added;
        next += offset + 1;
        break;
      }
    }
  }

  return changes;
}
