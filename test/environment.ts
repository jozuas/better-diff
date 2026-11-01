// A git hook exports GIT_DIR and GIT_INDEX_FILE, which would point git in a test's temporary
// repository at the repository being committed. Config, ignore and attributes files from the
// machine running the tests would make them pass or fail depending on the machine. A commit starts
// git maintenance in the background, whose lock file in `.git/objects` comes and goes while a test
// copies the repository. Processes started afterwards, such as a Paseo daemon, inherit the result.
export function isolateGit(): void {
  process.env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "maintenance.auto",
    GIT_CONFIG_VALUE_0: "false",
    XDG_CONFIG_HOME: "/dev/null",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
    GIT_EDITOR: "false",
  };
}
