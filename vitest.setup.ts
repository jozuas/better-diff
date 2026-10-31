import * as fc from "fast-check";

// Under Stryker, a fixed seed keeps whether a property kills a mutant from changing between runs,
// and shrinking a counterexample nobody reads only costs time.
if (process.env["STRYKER_MUTATOR_WORKER"] !== undefined) {
  fc.configureGlobal({ seed: 0, endOnFailure: true });
}

// A git hook exports GIT_DIR and GIT_INDEX_FILE, which would point git in a test's temporary
// repository at the repository being committed. Config, ignore and attributes files from the
// machine running the tests would make them pass or fail depending on the machine.
process.env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  XDG_CONFIG_HOME: "/dev/null",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  GIT_EDITOR: "false",
};
