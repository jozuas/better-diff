import { isDeepStrictEqual } from "node:util";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lineBytes } from "../test/file-contents";
import type { FileVersions } from "../test/file-contents";
import {
  asShown,
  changedLines,
  diffVersions,
  fullDiff,
  selectedChanges,
  withSelectedChanges,
} from "../test/full-diff";
import type { DiffLine } from "../test/full-diff";
import { inRepository, timeout, worktreeFile } from "../test/repository";
import {
  diffAlgorithm,
  file,
  fileState,
  operations,
  selectedLines,
  setUp,
  sides,
  sources,
  targets,
  writeVersion,
} from "../test/staging";
import type { Diff, FileState, Operation, Side } from "../test/staging";
import { applyFile, applyLines, readDiff } from "./diff";

// An agent's edit of the file in the worktree: from the line at `at`, counting round, some lines
// replaced with others, or the file deleted.
type Edit = { at: number; removed: number; added: Buffer[] } | "delete";

const edit: fc.Arbitrary<Edit> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      at: fc.nat(),
      removed: fc.nat({ max: 3 }),
      added: fc.array(lineBytes, { maxLength: 3 }),
    }),
  },
  { weight: 1, arbitrary: fc.constant("delete" as const) },
);

type Selection = (hunk: number, line: number) => boolean;

// What a step does: acts on the selected lines of the diff the operation acts on, or on every line
// of the hunks whose first line it selects, as a hunk's action does, or on the whole file; or edits
// the file in the worktree, as an agent does. An action can be on the diff as it was last read,
// which the steps since may have changed, as a click on a diff not yet refreshed is.
type Action =
  | { kind: "lines"; operation: Operation; hunks: boolean; isSelected: Selection; stale: boolean }
  | { kind: "file"; operation: Operation; stale: boolean };

type Step = Action | { kind: "edit"; edit: Edit };

const operation = fc.constantFrom(...operations);

const stale = fc.oneof(
  { weight: 2, arbitrary: fc.constant(false) },
  { weight: 1, arbitrary: fc.constant(true) },
);

const step: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("lines" as const),
      operation,
      hunks: fc.boolean(),
      isSelected: fc.func(fc.boolean()),
      stale,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("file" as const), operation, stale }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("edit" as const), edit }) },
);

// The file with the edit made. Split at its newlines, its last part is its last line, where that
// has no newline, or else the empty string after the last newline, so joined again it ends as it
// did, unless the edit replaces the last part.
function edited(content: Buffer | undefined, change: Edit): Buffer | undefined {
  if (change === "delete") {
    return undefined;
  }

  const parts = (content ?? Buffer.alloc(0)).toString("latin1").split("\n");

  return Buffer.from(
    parts
      .toSpliced(
        change.at % parts.length,
        change.removed,
        ...change.added.map((line) => line.toString("latin1")),
      )
      .join("\n"),
    "latin1",
  );
}

// Every line of a diff as git prints it, and which of the versions it goes between have the file:
// the diff changed if either did.
interface GitDiff {
  lines: DiffLine[];
  has: [boolean, boolean];
}

function gitDiffOf(repository: string, path: string, side: Side, versions: FileVersions): GitDiff {
  const [from, to] = diffVersions[side];

  return {
    lines: fullDiff(repository, path, side, versions),
    has: [versions[from] !== undefined, versions[to] !== undefined],
  };
}

interface Run {
  repository: string;
  path: string;
  head: Buffer | undefined;
  // The diff of each side as the plugin read it last, and as git printed it then.
  read: Map<Side, { diff: Diff; git: GitDiff }>;
}

function versionsOf({ repository, path, head }: Run): FileVersions {
  return { head, ...fileState(repository, path) };
}

// What a step did, or should have: its action's answer, the file in the index and the worktree,
// read as Latin-1 so they show as text where they differ, and the changed lines of the diff the
// plugin read for it, or that git prints.
interface Result {
  status: string | undefined;
  index: string | undefined;
  worktree: string | undefined;
  shown: ReturnType<typeof changedLines> | undefined;
}

interface Outcome {
  did: Result;
  should: Result;
}

function resultOf(
  status: string | undefined,
  { index, worktree }: FileState,
  shown?: Result["shown"],
): Result {
  return {
    status,
    index: index?.toString("latin1"),
    worktree: worktree?.toString("latin1"),
    shown,
  };
}

// The lines the step selects: those it selects, or every line of the hunks whose first line it
// selects.
function pickedBy({ hunks, isSelected }: Extract<Action, { kind: "lines" }>): Selection {
  return hunks ? (hunk) => isSelected(hunk, 0) : isSelected;
}

// The file once the action acted on the diff, which git prints as it did when it was read: with
// the selected changes made or undone, or all of them. Without changed lines, as an empty file's
// diff, there are none to select.
function changedBy(
  action: Action,
  diff: Diff,
  git: GitDiff,
  versions: FileVersions,
  before: FileState,
): FileState {
  const target = targets[action.operation];

  if (action.kind === "file") {
    return { ...before, [target]: versions[sources[action.operation]] };
  }

  if (git.lines.length === 0) {
    return before;
  }

  const selected = selectedChanges(diff, pickedBy(action));

  return {
    ...before,
    [target]: withSelectedChanges(git.lines, selected, action.operation, versions),
  };
}

async function apply(run: Run, action: Action, diff: Diff): Promise<string> {
  const { repository: directory, path } = run;
  const acted = { directory, path, operation: action.operation, version: diff.version };

  const { status } = await (action.kind === "lines"
    ? applyLines({ ...acted, lines: selectedLines(diff, pickedBy(action)) })
    : applyFile(acted));

  return status;
}

// Acts on the diff as the plugin reads it now, which should show git's, or as it read it last, and
// should change nothing where git's diff has changed since.
async function act(run: Run, action: Action): Promise<Outcome> {
  const { repository: directory, path } = run;
  const side = sides[action.operation];
  const versions = versionsOf(run);
  const git = gitDiffOf(directory, path, side, versions);
  const last = action.stale ? run.read.get(side) : undefined;
  const diff = last?.diff ?? (await readDiff({ directory, path, side }));
  const current = last === undefined || isDeepStrictEqual(last.git, git);
  const before = fileState(directory, path);

  if (last === undefined) {
    run.read.set(side, { diff, git });
  }

  const status = await apply(run, action, diff);
  const shown = last === undefined ? changedLines(diff) : undefined;
  const printed = last === undefined ? asShown(git.lines) : undefined;

  return {
    did: resultOf(status, fileState(directory, path), shown),
    should: current
      ? resultOf("applied", changedBy(action, diff, git, versions, before), printed)
      : resultOf("stale", before, printed),
  };
}

async function takeStep(run: Run, taken: Step): Promise<Outcome> {
  if (taken.kind !== "edit") {
    const outcome = await act(run, taken);

    return outcome;
  }

  const { repository, path } = run;

  writeVersion(repository, path, edited(worktreeFile(repository, path), taken.edit));

  const result = resultOf(undefined, fileState(repository, path));

  return { did: result, should: result };
}

// Each side's diff as the plugin reads it once the steps are taken, and as git prints it.
async function readsOf(run: Run): Promise<Outcome[]> {
  const { repository: directory, path } = run;
  const state = fileState(directory, path);

  const outcomes = await Promise.all(
    (["unstaged", "staged"] as const).map(async (side) => {
      const diff = await readDiff({ directory, path, side });
      const git = gitDiffOf(directory, path, side, versionsOf(run));

      return {
        did: resultOf(undefined, state, changedLines(diff)),
        should: resultOf(undefined, state, asShown(git.lines)),
      };
    }),
  );

  return outcomes;
}

async function takeSteps(run: Run, steps: readonly Step[]): Promise<Outcome[]> {
  const [next, ...rest] = steps;

  if (next === undefined) {
    const reads = await readsOf(run);

    return reads;
  }

  const outcome = await takeStep(run, next);
  const outcomes = await takeSteps(run, rest);

  return [outcome, ...outcomes];
}

test(
  "acting on a file's diff again and again, as it and the file change, makes or undoes exactly the changes selected each time, or nothing where the diff changed since it was read",
  async () => {
    await fc.assert(
      fc.asyncProperty(
        file,
        diffAlgorithm,
        fc.array(step, { minLength: 1, maxLength: 6 }),
        async ({ path, versions }, algorithm, steps) => {
          await inRepository(async (repository) => {
            setUp(repository, [{ path, versions }], algorithm);

            const outcomes = await takeSteps(
              { repository, path, head: versions.head, read: new Map() },
              steps,
            );

            expect(outcomes.map(({ did }) => did)).toStrictEqual(
              outcomes.map(({ should }) => should),
            );
          });
        },
      ),
      { numRuns: 30 },
    );
  },
  timeout,
);
