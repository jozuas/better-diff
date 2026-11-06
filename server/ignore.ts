import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import { z } from "zod";

import type { excludesFileRpc, ignoreRpc, patternsRpc } from "../shared/ignore";
import { entriesOf } from "./changes";
import { inTurn } from "./diff";
import { git } from "./git";
import { ignoredOf } from "./ignored";
import { isIn, repositoryOf } from "./repository";

type Place = RpcInput<typeof ignoreRpc>["place"];

// The name, escaped where a pattern would read it as more than the name: a backslash, a glob's `*`,
// `?` and `[`, and spaces at its end, which git drops. A newline or carriage return, which a rule
// can't have, is `?`, which matches either.
function literally(name: string): string {
  return name
    .replaceAll(/[\\*?[]/gu, (special) => `\\${special}`)
    .replaceAll(/[\n\r]/gu, "?")
    .replace(/ +$/u, (spaces) => "\\ ".repeat(spaces.length));
}

// The extension of a file's name, as Emacs finds it: what follows its last dot, unless that dot
// starts the name. None where nothing follows it.
function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");

  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : undefined;
}

// As Emacs sorts strings: by their characters' code points, as their UTF-8 bytes are ordered.
function byCodePoints(one: string, other: string): number {
  return Buffer.compare(Buffer.from(one), Buffer.from(other));
}

// The candidates for a rule in a directory, as Magit offers them, from the paths of what's
// untracked in it, from the directory: each file as `/path`, and each directory with no tracked
// files, whose path ends in `/`, as `/dir/`, and for each file with an extension, `*.ext`, and
// `/dir/*.ext` for one in a subdirectory. Each escaped, so it ignores what it names, and only that.
function patternsOf(paths: readonly string[]): string[] {
  const patterns = new Set<string>();

  for (const path of paths) {
    const slash = path.lastIndexOf("/");
    const extension = extensionOf(path.slice(slash + 1));

    patterns.add(`/${literally(path)}`);

    if (extension !== undefined) {
      patterns.add(`*.${literally(extension)}`);

      if (slash !== -1) {
        patterns.add(`/${literally(path.slice(0, slash + 1))}*.${literally(extension)}`);
      }
    }
  }

  return [...patterns].toSorted(byCodePoints);
}

// The paths git status lists as untracked in the directory at `inDirectory`, "" for the root, from
// it: with `untrackedFiles` normal, a directory with no tracked files in place of its files.
async function untrackedIn(
  directory: string,
  inDirectory: string,
  untrackedFiles: "all" | "normal",
): Promise<string[]> {
  const prefix = inDirectory === "" ? "" : `${inDirectory}/`;

  const status = await git(
    directory,
    "status",
    ["--porcelain=v2", `--untracked-files=${untrackedFiles}`],
    prefix === "" ? [] : [prefix],
  );

  return [...entriesOf(status.toString().split("\0").values())].flatMap(({ path, untracked }) =>
    untracked ? [path.slice(prefix.length)] : [],
  );
}

// The path from the directory at `inDirectory`, "" for the root, of the file at the path, which is
// in it.
function pathIn(inDirectory: string, path: string): string {
  if (inDirectory === "") {
    return path;
  }

  if (!path.startsWith(`${inDirectory}/`)) {
    throw new Error(`${path} isn't in ${inDirectory}.`);
  }

  return path.slice(inDirectory.length + 1);
}

export async function readPatterns({
  directory,
  path,
  inDirectory,
}: RpcInput<typeof patternsRpc>): Promise<RpcOutput<typeof patternsRpc>> {
  const file = `/${literally(pathIn(inDirectory, path))}`;

  const [files, listed] = await Promise.all([
    untrackedIn(directory, inDirectory, "all"),
    untrackedIn(directory, inDirectory, "normal"),
  ]);

  const patterns = patternsOf([...files, ...listed]);

  return { patterns, default: patterns.includes(file) ? file : null };
}

// The path core.excludesFile names, if it's set, as the config has it, or with `--path`, with `~`
// expanded.
async function excludesFileOf(
  directory: string,
  options: readonly string[],
): Promise<string | undefined> {
  const output = await git(directory, "config", [...options, "--get", "core.excludesFile"]);

  // With a newline after it, where it's set.
  return output.length === 0 ? undefined : output.toString().slice(0, -1);
}

export async function readExcludesFile({
  directory,
}: RpcInput<typeof excludesFileRpc>): Promise<RpcOutput<typeof excludesFileRpc>> {
  const path = await excludesFileOf(directory, []);

  return { path: path ?? null };
}

// The file a rule in the place goes in. git reads a relative core.excludesFile from the worktree's
// root.
async function fileOf(directory: string, place: Place): Promise<string> {
  const { top, common } = await repositoryOf(directory);

  if (place.kind === "private") {
    return join(common, "info", "exclude");
  }

  if (place.kind === "global") {
    const path = await excludesFileOf(directory, ["--path"]);

    if (path === undefined) {
      throw new Error("core.excludesFile isn't set.");
    }

    return resolve(top, path);
  }

  const shared = resolve(top, place.inDirectory, ".gitignore");

  if (!isIn(shared, top)) {
    throw new Error(`${place.inDirectory} isn't in the repository.`);
  }

  return shared;
}

// Why a file can't be read where it isn't there.
const missing = z.object({ code: z.literal("ENOENT") });

// What the file has, or nothing if it isn't there.
async function contentOf(file: string): Promise<Buffer> {
  try {
    const content = await readFile(file);

    return content;
  } catch (error) {
    if (missing.safeParse(error).success) {
      return Buffer.alloc(0);
    }

    throw error;
  }
}

// Adds the rule on a line of its own at the end of the file, which is made, with its directories,
// if it isn't there.
async function appendRule(file: string, rule: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });

  const content = await contentOf(file);
  const newline = content.length === 0 || content.at(-1) === 0x0a ? "" : "\n";

  await appendFile(file, `${newline}${rule}\n`);
}

// Stages the .gitignore, as Magit does, unless git ignores it, and so won't stage it.
async function stage(directory: string, file: string): Promise<void> {
  const { top } = await repositoryOf(directory);
  const path = relative(top, file);
  const ignored = await ignoredOf(top, [path]);

  if (!ignored.has(path)) {
    await git(top, "add", [], [path]);
  }
}

// In turn with the actions, since it can stage a .gitignore.
export async function ignore({
  directory,
  place,
  rule,
}: RpcInput<typeof ignoreRpc>): Promise<RpcOutput<typeof ignoreRpc>> {
  await inTurn(directory, async () => {
    const file = await fileOf(directory, place);

    await appendRule(file, rule);

    if (place.kind === "shared") {
      await stage(directory, file);
    }
  });

  return {};
}
