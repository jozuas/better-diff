import { withIntentToAdd } from "./changes";
import type { Entry } from "./changes";
import { changesFrom, diffOptions, ignoringWhitespace, listingOf } from "./file-changes";
import type { Changes, Listing, Side } from "./file-changes";
import { git } from "./git";
import { headerOf, lineStarts } from "./patch";
import type { Header } from "./patch";

// Reads each item, eight at a time: a group can have hundreds of files, each read by git commands
// of its own.
export async function readEach<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const left = items.entries();

  // Reads the next item no one has started on, until there are none.
  async function readNext(): Promise<void> {
    const next = left.next();

    if (next.done !== true) {
      const [index, item] = next.value;

      results[index] = await read(item);
      await readNext();
    }
  }

  await Promise.all(Array.from({ length: 8 }, readNext));

  return results;
}

interface ListedFile {
  path: string;
  listing: Listing;
}

// How a diff of several files reads a file's changes, by how git status lists it: one that's
// neither renamed nor untracked, with renames off, as diffing it on its own can't pair it with
// another file; a renamed one, with the path git status names; and one moved in the worktree, also
// with the files moved intent-to-add. An untracked file that isn't renamed is diffed with
// /dev/null, on its own.
type Batch = "own" | "renamed" | "moved";

function batchOf({ original, untracked }: Listing): Batch | undefined {
  if (original === undefined) {
    return untracked ? undefined : "own";
  }

  return untracked ? "moved" : "renamed";
}

// The paths a file's diff goes between: a renamed file's two.
function pathsOf({ path, listing }: ListedFile): string[] {
  return listing.original === undefined ? [path] : [listing.original, path];
}

// The diff between the paths, with the options, and with the files added intent-to-add, where
// they're moved.
async function diffOf(
  directory: string,
  batch: Batch,
  side: Side,
  paths: string[],
  added: string[],
  options: readonly string[],
): Promise<Buffer> {
  const diff =
    batch === "moved"
      ? await withIntentToAdd(directory, added, async (index) => {
          const movedDiff = await git(directory, "diff", options, paths, { index });

          return movedDiff;
        })
      : await git(
          directory,
          "diff",
          [...diffOptions[side], ...(batch === "own" ? ["--no-renames"] : []), ...options],
          paths,
        );

  return diff;
}

interface Diffs {
  diff: Buffer;
  // Where whitespace changes are to be hidden.
  withoutWhitespace: Buffer | undefined;
}

// The diff of the files, and with whitespace changes hidden where they're to be hidden, or undefined
// where git fails, as where it can't read one of the files, or one moved is gone.
async function diffsOf(
  directory: string,
  batch: Batch,
  side: Side,
  files: readonly ListedFile[],
  hideWhitespace: boolean | undefined,
): Promise<Diffs | undefined> {
  const paths = files.flatMap(pathsOf);
  // The files a moved file's diff has intent-to-add.
  const added = files.map(({ path }) => path);

  try {
    const [diff, withoutWhitespace] = await Promise.all([
      diffOf(directory, batch, side, paths, added, []),
      hideWhitespace === true
        ? diffOf(directory, batch, side, paths, added, ignoringWhitespace)
        : undefined,
    ]);

    return { diff, withoutWhitespace };
  }
  // Stryker disable next-line BlockStatement: an empty catch has it return undefined all the same.
  catch {
    return undefined;
  }
}

// One file's diff in a diff of several. A file that changed type, as to a symlink, has one for each
// version.
interface DiffPart {
  header: Header;
  diff: Buffer;
}

// Each file's diff in a diff of several, in the order git prints them. It starts with a line that
// names its paths, or for a file with merge conflicts, its path. No other line starts like that: a
// hunk's lines start with " ", "-", "+" or "\", and git quotes a path with a newline in it, except
// where it names a file with merge conflicts, which no group lists.
function partsOf(diff: Buffer): DiffPart[] {
  const starts = [
    ...lineStarts(diff, "diff --git "),
    ...lineStarts(diff, "diff --cc "),
    ...lineStarts(diff, "* Unmerged path "),
  ].toSorted((one, other) => one - other);

  return starts.map((start, index) => {
    const part = diff.subarray(start, starts[index + 1]);

    return { header: headerOf(part), diff: part };
  });
}

// The letters git escapes these characters with where it quotes a path.
const escapeLetters = new Map([
  ["\u0007", "a"],
  ["\b", "b"],
  ["\t", "t"],
  ["\n", "n"],
  ["\v", "v"],
  ["\f", "f"],
  ["\r", "r"],
  ['"', '"'],
  ["\\", "\\"],
]);

// A byte of a path as git prints it, as latin1 reads it: a control character, a quote or a
// backslash escaped, by a letter or else in octal.
function escaped(byte: number): string {
  const character = String.fromCodePoint(byte);

  if (byte >= 0x20 && byte !== 0x7f && !escapeLetters.has(character)) {
    return character;
  }

  return `\\${escapeLetters.get(character) ?? byte.toString(8).padStart(3, "0")}`;
}

// A path as git prints it in a diff's header, as latin1 reads it: quoted where it escapes any of
// its bytes.
function printed(path: string): string {
  const bytes = Buffer.from(path);
  const escapedPath = [...bytes].map(escaped).join("");

  return escapedPath === bytes.toString("latin1") ? escapedPath : `"${escapedPath}"`;
}

// Whether a part of the diff of several is the file's: for a renamed file, the part that renames it
// from the path git status names, and for another, each part with its path in both versions.
function isPartOf({ path, listing: { original } }: ListedFile): (header: Header) => boolean {
  if (original === undefined) {
    const paths = `${printed(`a/${path}`)} ${printed(`b/${path}`)}`;

    return (header) => header["diff --git"] === paths;
  }

  const from = printed(original);
  const to = printed(path);

  return (header) => header["rename from"] === from && header["rename to"] === to;
}

// The file's parts of a diff of several, together.
function ownDiff(parts: readonly DiffPart[], file: ListedFile): Buffer {
  const isOwn = isPartOf(file);

  return Buffer.concat(parts.flatMap(({ header, diff }) => (isOwn(header) ? [diff] : [])));
}

// Each file's changes in the diffs of several. A file the diff has no part for is left out: git
// pairs a renamed file with another than git status did, or none, or a file's changes are gone, or
// the diff of a file `a` leaves out what's in a directory `a/`, as where one replaced it. The diff
// of a file with merge conflicts is a part of no file's. The diff with whitespace changes hidden
// has no part for a file whose changes are all to whitespace, unless it's renamed or its mode
// changed.
function changesIn(
  { diff, withoutWhitespace }: Diffs,
  files: readonly ListedFile[],
): [string, Changes][] {
  const parts = partsOf(diff);
  const hiddenParts = withoutWhitespace === undefined ? undefined : partsOf(withoutWhitespace);

  return files.flatMap((file) => {
    const { path, listing } = file;
    const own = ownDiff(parts, file);

    if (own.length === 0) {
      return [];
    }

    const changes = changesFrom(own, path, listing.original, listing);

    return [
      [
        path,
        hiddenParts === undefined
          ? changes
          : { ...changes, withoutWhitespace: ownDiff(hiddenParts, file) },
      ],
    ];
  });
}

// Each file's changes that the diffs of several read.
async function readBatch(
  directory: string,
  side: Side,
  batch: Batch,
  files: readonly ListedFile[],
  hideWhitespace: boolean | undefined,
): Promise<[string, Changes][]> {
  const diffs = await diffsOf(directory, batch, side, files, hideWhitespace);

  return diffs === undefined ? [] : changesIn(diffs, files);
}

// Fifty items at a time: as arguments, the paths of as many files as a group can have would be
// more than a process can start with, and diffs of fewer run side by side.
function chunksOf<T>(items: readonly T[]): T[][] {
  return items.length === 0 ? [] : [items.slice(0, 50), ...chunksOf(items.slice(50))];
}

// The changes on the side of each of the files, by path, that diffs of several read, with their diffs
// with whitespace changes hidden where they're to be hidden. They're the changes the file's diff on
// its own would read: a file left out has to be read on its own.
export async function batchedChanges(
  directory: string,
  listings: ReadonlyMap<string, readonly Entry[]>,
  side: Side,
  hideWhitespace?: boolean,
): Promise<Map<string, Changes>> {
  const files = [...listings].map(([path, listed]) => ({ path, listing: listingOf(listed, side) }));

  const batches = (["own", "renamed", "moved"] as const).flatMap((batch) =>
    chunksOf(files.filter(({ listing }) => batchOf(listing) === batch)).map((chunk) => ({
      batch,
      chunk,
    })),
  );

  const read = await readEach(batches, async ({ batch, chunk }) => {
    const changes = await readBatch(directory, side, batch, chunk, hideWhitespace);

    return changes;
  });

  return new Map(read.flat());
}
