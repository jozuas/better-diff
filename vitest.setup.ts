import * as fc from "fast-check";

// Under Stryker, a fixed seed keeps whether a property kills a mutant from changing between runs,
// and shrinking a counterexample nobody reads only costs time.
if (process.env["STRYKER_MUTATOR_WORKER"] !== undefined) {
  fc.configureGlobal({ seed: 0, endOnFailure: true });
}
