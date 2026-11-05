import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, applyModeRpc, diffRpc } from "../shared/diff";
import { indexOf } from "./changes";
import { collapsed, generatedPaths } from "./collapse";
import { changesOf, versionOfChanges } from "./file-changes";
import type { Changes, Side } from "./file-changes";
import { git } from "./git";
import { highlighted } from "./highlight";
import type { UnhighlightedDiff } from "./highlight";
import {
  buildModePatch,
  buildPatch,
  kindOf,
  lineStarts,
  modeOf,
  parseDiff,
  reverse,
} from "./patch";
import type { FileDiff } from "./patch";
import { sameChanges } from "./same-changes";

type Action = RpcInput<typeof applyFileRpc>;

type Status = RpcOutput<typeof applyFileRpc>;

type LinesStatus = RpcOutput<typeof applyLinesRpc>;

type Kind = RpcOutput<typeof diffRpc>["kind"];

// The diff each operation acts on.
const sides: Record<Action["operation"], Side> = {
  stage: "unstaged",
  unstage: "staged",
  discard: "unstaged",
};

// The command that makes or undoes all of a tracked file's changes. `git reset` unstages them where
// `git restore --staged` can't, before the first commit.
const fileCommands = { stage: "add", unstage: "reset", discard: "restore" } as const;

// Whether the diff changes lines, whatever else it changes, such as the file's mode: git prints a
// hunk, with every line of context, only for a change to lines, and no other line starts as a
// hunk's start does.
function changesLines(diff: Buffer): boolean {
  const [hunk] = lineStarts(diff, "@@ -");

  return hunk !== undefined;
}

// What the changes' diff is, as shown, from what the diff shown is: with whitespace changes
// hidden, what the diff that shows them is, but for a text diff whose changes to lines are all to
// whitespace, which is a whitespace one.
function kindShown({ diff, withoutWhitespace }: Changes, shown: Kind): Kind {
  if (withoutWhitespace === undefined) {
    return shown;
  }

  const kind = kindOf(diff);

  return kind === "text" && changesLines(diff) && !changesLines(withoutWhitespace)
    ? "whitespace"
    : kind;
}

function text(content: Buffer): string {
  return content.toString("utf8");
}

// The diff of the changes, with whitespace changes hidden where they're hidden.
export function diffOf(changes: Changes): UnhighlightedDiff {
  const { diff, withoutWhitespace, renamedFrom } = changes;
  const { kind: shownKind, header, hunks, lines } = parseDiff(withoutWhitespace ?? diff);
  const changed = hunks.flatMap((hunk) => hunk.lines);

  return {
    version: versionOfChanges(changes),
    kind: kindShown(changes, shownKind),
    renamedFrom,
    mode: modeOf(header),
    added: changed.filter(({ kind }) => kind === "added").length,
    removed: changed.filter(({ kind }) => kind === "removed").length,
    hunks: hunks.map(({ oldStart, newStart, lines: hunkLines }) => ({
      oldStart,
      newStart,
      lines: hunkLines.map(({ kind, content, newline }) => ({
        kind,
        text: text(content),
        newline,
      })),
    })),
    contents: {
      old: lines.flatMap(({ kind, content }) => (kind === "added" ? [] : [text(content)])),
      new: lines.flatMap(({ kind, content }) => (kind === "removed" ? [] : [text(content)])),
    },
  };
}

export async function readDiff({
  directory,
  path,
  side,
  expand,
  entire,
  hideWhitespace,
}: RpcInput<typeof diffRpc>): Promise<RpcOutput<typeof diffRpc>> {
  const [changes, generated] = await Promise.all([
    changesOf(directory, path, side, hideWhitespace),
    expand === true ? undefined : generatedPaths(directory, [path]),
  ]);

  const diff = diffOf(changes);
  const shown = generated === undefined ? diff : collapsed(diff, generated.has(path));
  const read = await highlighted(shown, path, entire === true);

  return read;
}

// The last apply to start on each index.
const applying = new Map<string, Promise<unknown>>();

async function after<Applied>(
  previous: Promise<unknown> | undefined,
  apply: () => Promise<Applied>,
): Promise<Applied> {
  await Promise.allSettled([previous]);

  const status = await apply();

  return status;
}

// Applies once the previous apply to the directory's index has finished. Two at once could both
// find the diff unchanged, and the second would then apply to what the first left, where
// `git apply` can find a patch's lines in another place.
export async function inTurn<Applied>(
  directory: string,
  apply: () => Promise<Applied>,
): Promise<Applied> {
  const index = await indexOf(directory);
  const applied = after(applying.get(index), apply);

  applying.set(index, applied);

  const status = await applied;

  return status;
}

// In turn, acts on the diff the operation acts on, if it is still the one the action was chosen
// from, or as it is, without a version.
async function applyToFile<Applied>(
  { directory, path, operation, version, hideWhitespace }: Action,
  act: (changes: Changes) => Promise<Applied>,
): Promise<Applied | { status: "stale" }> {
  const status = await inTurn(directory, async () => {
    const changes = await changesOf(directory, path, sides[operation], hideWhitespace);

    if (version !== null && versionOfChanges(changes) !== version) {
      return { status: "stale" } as const;
    }

    const applied = await act(changes);

    return applied;
  });

  return status;
}

// The diff to make a patch of for the operation: the diff to stage, its reverse to unstage or
// discard.
function patchedBy(operation: Action["operation"], diff: FileDiff): FileDiff {
  return operation === "stage" ? diff : reverse(diff);
}

// Applies the patch to the index, or to the worktree to discard.
async function applyPatch(
  directory: string,
  operation: Action["operation"],
  patch: Buffer,
): Promise<void> {
  await git(directory, "apply", operation === "discard" ? [] : ["--cached"], [], {
    input: patch,
  });
}

// Stages, unstages or discards the selected lines' changes, found in the diff that shows them all
// where whitespace changes are hidden, unless they leave other lines there than in the diff shown.
export async function applyLines({
  lines,
  ...action
}: RpcInput<typeof applyLinesRpc>): Promise<LinesStatus> {
  const { directory, operation } = action;

  const status = await applyToFile(action, async ({ diff, withoutWhitespace }) => {
    const parsed = parseDiff(diff);
    const shown = withoutWhitespace === undefined ? parsed : parseDiff(withoutWhitespace);

    for (const { hunk, line } of lines) {
      if (shown.hunks[hunk]?.lines[line] === undefined) {
        throw new Error(`The diff has no line ${line} in hunk ${hunk}.`);
      }
    }

    const isSelected = sameChanges(parsed, shown, lines, operation !== "stage");

    if (isSelected === undefined) {
      return { status: "misaligned" } as const;
    }

    const patch = buildPatch(patchedBy(operation, parsed), isSelected);

    if (patch.length > 0) {
      await applyPatch(directory, operation, patch);
    }

    return { status: "applied" } as const;
  });

  return status;
}

// Stages, unstages or discards the file's mode change.
export async function applyMode(action: RpcInput<typeof applyModeRpc>): Promise<Status> {
  const { directory, operation } = action;

  const status = await applyToFile(action, async ({ diff }) => {
    const parsed = parseDiff(diff);

    if (modeOf(parsed.header) === undefined) {
      throw new Error("The diff has no mode change.");
    }

    await applyPatch(directory, operation, buildModePatch(patchedBy(operation, parsed)));

    return { status: "applied" } as const;
  });

  return status;
}

// A file, and its changes on the side an operation acts on.
export interface ChangedFile {
  path: string;
  changes: Changes;
}

// Whether the operation deletes the file: discarding a file new in the worktree, untracked or
// intent-to-add, deletes it.
function deletes(operation: Action["operation"], { untracked, intentToAdd }: Changes): boolean {
  return operation === "discard" && (untracked || intentToAdd);
}

// Runs the command on the paths, if there are any: with none, `git clean` and `git reset` act on
// every file.
async function gitOn(
  directory: string,
  command: "restore" | "rm" | "add" | "reset" | "clean",
  paths: readonly string[],
  options: readonly string[] = [],
): Promise<void> {
  if (paths.length > 0) {
    await git(directory, command, options, paths);
  }
}

// Runs `git clean` on the paths a hundred at a time: it can't read them from its input, as the
// others do, and as arguments, as many as a group of files can have would be more than a process
// can start with.
async function cleanEach(directory: string, paths: readonly string[]): Promise<void> {
  if (paths.length > 0) {
    await gitOn(directory, "clean", paths.slice(0, 100));
    await cleanEach(directory, paths.slice(100));
  }
}

// Stages, unstages or discards all of the files' changes, including those a patch can't make, such
// as a binary file's or a mode change, and a rename, both of whose paths it acts on. A file whose
// diff has no changes is left alone. A file discarding deletes goes with `git clean`, which never
// touches a tracked file, once the file it was renamed from is back and it's out of the index.
// Each command runs once for all the files it acts on, and `git clean` once for each hundred.
export async function applyChanges(
  directory: string,
  operation: Action["operation"],
  files: readonly ChangedFile[],
): Promise<void> {
  const changed = files.flatMap(({ path, changes }) =>
    changes.diff.length > 0 ? [{ path, ...changes }] : [],
  );

  const deleted = changed.filter((file) => deletes(operation, file));
  const kept = changed.filter((file) => !deletes(operation, file));

  await gitOn(
    directory,
    "restore",
    deleted.flatMap(({ renamedFrom }) => renamedFrom ?? []),
  );
  await gitOn(
    directory,
    "rm",
    deleted.flatMap(({ path, intentToAdd }) => (intentToAdd ? [path] : [])),
    ["--cached"],
  );
  await gitOn(
    directory,
    fileCommands[operation],
    kept.flatMap(({ paths }) => paths),
  );
  await cleanEach(
    directory,
    deleted.flatMap(({ paths }) => paths),
  );
}

// Unstaging a renamed file unstages only the file, and leaves the deletion of the one it was renamed
// from staged, as Sublime Merge and Magit do. Unstaging a group unstages both.
export async function applyFile(action: Action): Promise<Status> {
  const { directory, path, operation } = action;

  const status = await applyToFile(action, async (changes) => {
    const paths = operation === "unstage" ? [path] : changes.paths;

    await applyChanges(directory, operation, [{ path, changes: { ...changes, paths } }]);

    return { status: "applied" } as const;
  });

  return status;
}
