import * as fc from "fast-check";
import { expect, test } from "vitest";

import { entireShown } from "./runs";

const version = fc.string({ unit: "binary" });

const read = fc.record({ version });

test("a read of the entire file shows once it's of the version of the diff shown, whether one showed before or not", () => {
  fc.assert(
    fc.property(read, fc.boolean(), (entire, showing) => {
      expect(entireShown(entire, entire.version, showing)).toBe(entire);
    }),
  );
});

test("a read of the entire file of another version than the diff shown doesn't start to show", () => {
  fc.assert(
    fc.property(read, version, (entire, shown) => {
      fc.pre(shown !== entire.version);

      expect(entireShown(entire, shown, false)).toBeUndefined();
    }),
  );
});

test("once a read of the entire file shows, the one read last shows, of whichever version", () => {
  fc.assert(
    fc.property(read, version, (entire, shown) => {
      expect(entireShown(entire, shown, true)).toBe(entire);
    }),
  );
});

test("the entire file doesn't show until it's read", () => {
  fc.assert(
    fc.property(version, fc.boolean(), (shown, showing) => {
      expect(entireShown(undefined, shown, showing)).toBeUndefined();
    }),
  );
});
