import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Sets up repositories and checks results without going through server/git.ts.
export function runGit(repository: string, args: readonly string[]): string {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd: repository,
    encoding: "utf8",
  });
}

// For a property test whose runs each set up a repository, which takes git about 100ms.
export const timeout = 60_000;

export async function inRepository(test: (repository: string) => Promise<void>): Promise<void> {
  const repository = mkdtempSync(join(tmpdir(), "better-diff-"));

  try {
    runGit(repository, ["init", "--quiet"]);
    await test(repository);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

export function writeFile(repository: string, path: string, content: string): void {
  const file = join(repository, path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function deleteFile(repository: string, path: string): void {
  rmSync(join(repository, path), { force: true });
}
