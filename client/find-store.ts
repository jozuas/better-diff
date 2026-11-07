import { createContext } from "react";

import type { TextRange } from "./changed-text";
import { finder } from "./find";
import type { FindableFile, FoundLines } from "./find";

// What the find bar shows.
export interface FindState {
  open: boolean;
  text: string;
  matchCase: boolean;
  // How many matches there are, and the current one's index among them, while there are any.
  count: number;
  current: number | undefined;
  // How many of the files shown are collapsed, which it doesn't find in.
  collapsed: number;
}

// A match in a file a view shows, at the container, by its section, its line's index in it, and
// where it is in the line.
interface Match extends TextRange {
  container: string;
  file: FindableFile;
  section: number;
  line: number;
}

// Whether the first match is before the second, 0 for the same place, or after it, by where they
// are in the view.
function compare(match: Match, other: Match): number {
  return (
    match.file.index - other.file.index ||
    match.section - other.section ||
    match.line - other.line ||
    match.start - other.start
  );
}

// Where the text is in a file's lines: by section, the ranges in each line, by the line's index, and
// the matches, in order.
interface FileFound {
  sections: ReadonlyMap<number, readonly TextRange[]>[];
  matches: Match[];
}

// A section's matches as last given, with the current match if it's in the section.
interface SectionShown {
  found: ReadonlyMap<number, readonly TextRange[]>;
  current: Match | undefined;
  lines: FoundLines;
}

// A file the find bar reads, and what it found in it with what's typed, once that's asked for.
interface Entry {
  file: FindableFile;
  found: FileFound | undefined;
  shown: Map<number, SectionShown>;
}

// The matches in all the files shown, in order, and the current one and its index, while there
// are any.
interface Found {
  matches: Match[];
  current: number | undefined;
  match: Match | undefined;
}

// The find bar's state, and what the diffs shown found, which each hears apart, so that moving to
// another match renders only the lines it moves from and to.
export interface Find {
  state: () => FindState;
  // Calls the listener each time something changes, until the returned function is called.
  subscribe: (listener: () => void) => () => void;
  // Opens the find bar, and finds what's typed in it from the top of the view.
  open: () => void;
  // Closes the find bar, which then finds nothing until it opens again.
  close: () => void;
  // Finds the text, from the current match, or else the top of the view.
  search: (text: string) => void;
  setMatchCase: (matchCase: boolean) => void;
  // Moves to the next match, 1, or the one before, -1, round from either end, and shows it.
  step: (by: 1 | -1) => void;
  // Has the find bar find in the file shown at the container, until the returned function is
  // called.
  add: (container: string, file: FindableFile) => () => void;
  // The matches in the lines of the section of the file shown at the container, the same until
  // they change.
  foundIn: (container: string, section: number) => FoundLines;
}

const nothing: FoundLines = new Map();

export function findStore(): Find {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let open = false;
  let text = "";
  let matchCase = false;
  let search = finder(text, matchCase);
  // The current match, which stays where it was as the diffs shown change, until another is.
  let position: Match | undefined;
  // Counts changes, so what's made of the state is made again only once it changes.
  let version = 0;
  let found: (Found & { version: number }) | undefined;
  let state: (FindState & { version: number }) | undefined;

  // Has what's made of the state made again, and tells the listeners.
  function changed(): void {
    version += 1;

    for (const listener of listeners) {
      listener();
    }
  }

  function findIn(container: string, entry: Entry): FileFound {
    const matches: Match[] = [];

    const sections = entry.file.sections.map((lines, section) => {
      const ranges = new Map<number, TextRange[]>();

      for (const [line, lineText] of lines.entries()) {
        const inLine = search(lineText);

        if (inLine.length > 0) {
          ranges.set(line, inLine);
          matches.push(
            ...inLine.map(({ start, end }) => ({
              start,
              end,
              container,
              file: entry.file,
              section,
              line,
            })),
          );
        }
      }

      return ranges;
    });

    return { sections, matches };
  }

  function foundOf(container: string, entry: Entry): FileFound {
    entry.found ??= findIn(container, entry);

    return entry.found;
  }

  // Whether the view the match is in still shows.
  function shows(match: Match): boolean {
    return [...entries.values()].some(({ file }) => file.view === match.file.view);
  }

  function currentOf(matches: readonly Match[]): number | undefined {
    if (matches.length === 0) {
      return undefined;
    }

    const from = position;

    if (from === undefined || !shows(from)) {
      return 0;
    }

    return Math.max(
      0,
      matches.findIndex((match) => compare(match, from) >= 0),
    );
  }

  function foundNow(): Found {
    // Stryker disable next-line ConditionalExpression: making them again makes the same matches, only slower.
    if (found?.version !== version) {
      const matches = open
        ? [...entries]
            .toSorted(([, one], [, other]) => one.file.index - other.file.index)
            .flatMap(([container, entry]) => foundOf(container, entry).matches)
        : [];

      const current = currentOf(matches);

      found = { matches, current, match: matches[current ?? matches.length], version };
    }

    return found;
  }

  function moveTo(match: Match | undefined): void {
    if (match !== undefined) {
      position = match;
      match.file.reveal(match.section, match.line);
    }
  }

  // The first match at or after the current one, or with none, at or after the top of the view.
  function fromCurrent(): void {
    const { matches, match } = foundNow();

    if (position !== undefined && shows(position)) {
      moveTo(match);
    } else {
      const top = matches.findIndex(
        ({ file, section, line }) => (file.offsetOf(section, line) ?? -1) >= 0,
      );

      moveTo(matches[Math.max(0, top)]);
    }
  }

  function searchAgain(): void {
    search = finder(text, matchCase);

    for (const entry of entries.values()) {
      entry.found = undefined;
    }

    version += 1;
    fromCurrent();
    changed();
  }

  return {
    state: () => {
      if (state?.version !== version) {
        const { matches, current } = foundNow();

        state = {
          open,
          text,
          matchCase,
          count: matches.length,
          current,
          collapsed: open ? [...entries.values()].filter(({ file }) => file.collapsed).length : 0,
          version,
        };
      }

      return state;
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    open: () => {
      if (!open) {
        open = true;
        version += 1;
        fromCurrent();
        changed();
      }
    },
    close: () => {
      open = false;
      position = undefined;
      changed();
    },
    search: (searched) => {
      text = searched;
      searchAgain();
    },
    setMatchCase: (on) => {
      matchCase = on;
      searchAgain();
    },
    step: (by) => {
      const { matches, current } = foundNow();

      if (current !== undefined) {
        moveTo(matches[(current + by + matches.length) % matches.length]);
        changed();
      }
    },
    add: (container, file) => {
      const entry: Entry = { file, found: undefined, shown: new Map() };

      entries.set(container, entry);
      changed();

      return () => {
        if (entries.get(container) === entry) {
          entries.delete(container);
          changed();
        }
      };
    },
    foundIn: (container, section) => {
      const entry = entries.get(container);

      if (!open || entry === undefined) {
        return nothing;
      }

      const ranges = foundOf(container, entry).sections[section];

      if (ranges === undefined || ranges.size === 0) {
        return nothing;
      }

      const { match } = foundNow();

      const here =
        // Stryker disable next-line OptionalChaining: a section with matches has a current one.
        match?.container === container && match.section === section ? match : undefined;

      const before = entry.shown.get(section);

      if (before?.found === ranges && before.current === here) {
        return before.lines;
      }

      const lines = new Map(
        [...ranges].map(([line, inLine]) => [
          line,
          inLine.map(({ start, end }) => ({
            start,
            end,
            current: here?.line === line && here.start === start,
          })),
        ]),
      );

      entry.shown.set(section, { found: ranges, current: here, lines });

      return lines;
    },
  };
}

// The panel's, which its find bar and diffs share.
export const FindContext = createContext(findStore());
