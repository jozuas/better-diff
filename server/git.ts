import { execCommand } from "@getpaseo/plugin/server";

// Options without which the user's config could change output the plugin parses.
const commandOptions = {
  // Paths NUL-terminated and never quoted.
  status: ["-z"],
  // Git's own patch, which `git apply` takes back: not an external tool's or a textconv filter's,
  // without colour codes, and with the a/ and b/ prefixes whatever diff.noprefix and
  // diff.mnemonicPrefix say.
  diff: ["--no-ext-diff", "--no-textconv", "--no-color", "--src-prefix=a/", "--dst-prefix=b/"],
};

export async function git(
  directory: string,
  command: keyof typeof commandOptions,
  options: readonly string[],
  paths: readonly string[] = [],
): Promise<string> {
  const { stdout } = await execCommand(
    "git",
    [
      "-c",
      "core.quotePath=false",
      // A path names a file, never a pattern such as `*` or `:!x`.
      "--literal-pathspecs",
      // Reading doesn't refresh the index, so it never holds the index lock while an agent's own
      // git command needs it.
      "--no-optional-locks",
      command,
      ...commandOptions[command],
      ...options,
      "--",
      ...paths,
    ],
    { cwd: directory },
  );

  return stdout;
}
