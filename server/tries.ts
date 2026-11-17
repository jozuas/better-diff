// How many times a file's diffs are read, at most, for both to be read of the same lines of the
// index.
const tries = 3;

// What `read` reads, read again while it says the index changed as it was read, as while a file's
// two diffs are read of different lines of the index, `tries` times at most.
export async function untilUnchanged<Read extends { changed: boolean }>(
  read: () => Promise<Read>,
  left = tries,
): Promise<Read> {
  const once = await read();

  if (!once.changed || left <= 1) {
    return once;
  }

  const again = await untilUnchanged(read, left - 1);

  return again;
}
