import { relative } from "node:path";

import { git } from "./git";

// The paths of those given that git ignores, relative to the worktree. Not that of a file in the
// index, which git doesn't ignore, though it's in a directory git ignores.
export async function ignoredOf(top: string, paths: readonly string[]): Promise<Set<string>> {
  // Stryker disable next-line ConditionalExpression,BlockStatement: asking git about no path finds none it ignores, and only takes longer.
  if (paths.length === 0) {
    return new Set();
  }

  // git reads a path that starts with `:` as pathspec magic, which git check-ignore refuses, but
  // not one that starts with `./`, which it prints as it reads it.
  const output = await git(top, "check-ignore", [], [], {
    input: Buffer.from(paths.map((path) => `./${path}\0`).join("")),
  });

  return new Set(
    output
      .toString()
      .split("\0")
      .map((path) => path.slice("./".length)),
  );
}

// Tells of each change in the worktree but those to what git ignores: a build or a dev server can
// write over and over in a directory git ignores, such as dist, or to a file such as a log, which
// would have git status run each time. It asks git about the paths that changed, those that change
// as it asks all at once after, and about each only once, until told to forget, as what git
// ignores changes. Where git can't say, as of a path in a submodule, it tells of each, and asks
// again the next time.
export class Ignored {
  readonly #top: string;
  readonly #changed: (path: string) => void;
  // Whether git ignores each path it asked about, and those to ask about once it has.
  #answers = new Map<string, boolean>();
  readonly #unasked = new Set<string>();
  #asking = false;
  #stopped = false;

  constructor(top: string, changed: (path: string) => void) {
    this.#top = top;
    this.#changed = changed;
  }

  // What changed at the path, in the worktree.
  heard(path: string): void {
    const ignored = this.#answers.get(path);

    if (ignored === undefined) {
      this.#unasked.add(path);

      // Stryker disable next-line ConditionalExpression: asking about some paths as it asks about others finds the same, and only takes longer.
      if (!this.#asking) {
        void this.#ask();
      }
    } else if (!ignored) {
      this.#changed(path);
    }
  }

  forget(): void {
    this.#answers = new Map();
  }

  stop(): void {
    this.#stopped = true;
  }

  // An answer that comes once it was told to forget is left out, as it can be out of date.
  async #ask(): Promise<void> {
    const paths = [...this.#unasked];
    const answers = this.#answers;

    // Stryker disable next-line BooleanLiteral: asking about some paths as it asks about others finds the same, and only takes longer.
    this.#asking = true;
    this.#unasked.clear();

    const ignored = await ignoredOf(
      this.#top,
      paths.map((path) => relative(this.#top, path)),
    ).catch(() => null);

    for (const path of paths) {
      const isIgnored = ignored?.has(relative(this.#top, path)) ?? false;

      if (ignored !== null) {
        answers.set(path, isIgnored);
      }

      if (!isIgnored && !this.#stopped) {
        this.#changed(path);
      }
    }

    this.#asking = false;

    if (this.#unasked.size > 0) {
      await this.#ask();
    }
  }
}
