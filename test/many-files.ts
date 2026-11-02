// More bytes of paths than a process can start with as arguments: macOS lets it start with 1 MiB of
// arguments and environment, and Linux with a quarter of its stack size limit, but at most 6 MiB. A
// path, the temporary directory's included, can be 1024 bytes long on macOS and 4096 on Linux, where
// longer paths take fewer files: about 2.4 MB of paths on macOS, and 7.2 MB on Linux.
const { count, directories } =
  process.platform === "darwin"
    ? { count: 3000, directories: 3 }
    : { count: 2000, directories: 17 };

export const manyPaths = Array.from({ length: count }, (_, index) =>
  [
    ...Array.from({ length: directories }, () => "a".repeat(200)),
    `${index}${"b".repeat(200)}`,
  ].join("/"),
);
