import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import { watchRpc } from "../shared/changes";
import { refreshOnChanges } from "./refresh";
import type { Following } from "./refresh";
import { Subscribed } from "./subscribed";

interface RefreshOnChangesProps {
  directory: string;
  // The version the changes were read at, undefined until they're read, or an empty one, which
  // none is, if they couldn't be.
  from: string | undefined;
  // Shows the changes as they are once at the version, or later.
  refresh: (version: string) => Promise<void>;
}

// Shows the directory's changes as they are whenever the server tells that they may have changed,
// as while an agent edits its files, once they're first read. It subscribes only then, as the server
// looks at the files at once for a new subscriber, which beside the read's look would slow both
// where git status is slow. The server tells of the version anew each time it's subscribed to, as
// once Paseo is connected again, or a while after the server stopped telling. Shows nothing
// itself.
export function RefreshOnChanges({
  directory,
  from,
  refresh,
}: RefreshOnChangesProps): ReactElement | null {
  const following = useRef<Following>(undefined);

  useEffect(() => {
    const stopping = new AbortController();

    following.current = refreshOnChanges(refresh, stopping.signal);

    return () => {
      stopping.abort();
    };
  }, [refresh]);

  // After every render, as it takes only the first version it's given: one made once the changes
  // were read, as `refresh` changes, is given theirs too.
  useEffect(() => {
    if (from !== undefined) {
      following.current?.read(from);
    }
  });

  return from === undefined ? null : (
    <Subscribed
      contract={watchRpc}
      input={{ directory }}
      onEvent={({ version }) => {
        following.current?.told(version);
      }}
    />
  );
}
