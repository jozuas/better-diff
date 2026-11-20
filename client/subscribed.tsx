import type { PluginSubscriptionContract } from "@getpaseo/plugin";
import { useSubscription } from "@getpaseo/plugin/client";
import type { ReactElement } from "react";
import { useEffect, useReducer } from "react";
import type { ZodType, output as ZodOutput } from "zod";

import { firstSubscribing, restAfter, subscribingAfter } from "./subscribing";

interface SubscribedProps<Input extends ZodType, Event extends ZodType> {
  contract: PluginSubscriptionContract<Input, Event>;
  input: Parameters<typeof useSubscription<Input, Event>>[1];
  // Hears each event the server tells of.
  onEvent: (event: ZodOutput<Event>) => void;
}

interface OnceProps<Input extends ZodType, Event extends ZodType> extends SubscribedProps<
  Input,
  Event
> {
  // How many milliseconds after the server stops telling it says so.
  rest: number;
  // Hears that the server told of nothing for that long since it stopped telling.
  onEnded: (heard: "ended") => void;
}

function Once<Input extends ZodType, Event extends ZodType>({
  contract,
  input,
  onEvent,
  rest,
  onEnded,
}: OnceProps<Input, Event>): null {
  const { status } = useSubscription(contract, input, onEvent);
  const ended = status === "closed" || status === "error";

  useEffect(() => {
    if (!ended) {
      return () => {};
    }

    const resting = setTimeout(onEnded, rest, "ended");

    return () => {
      clearTimeout(resting);
    };
  }, [ended, onEnded, rest]);

  return null;
}

// Subscribes to what the plugin's server tells of while it's shown. Paseo subscribes again once
// it's connected again, but not once the server closes the subscription, or refuses it, as while
// the plugin's server is stopped, or starts again: this subscribes again a second later, and later
// each time the server has told of nothing since. Shows nothing itself.
export function Subscribed<Input extends ZodType, Event extends ZodType>({
  onEvent,
  ...props
}: SubscribedProps<Input, Event>): ReactElement {
  const [subscribing, hear] = useReducer(subscribingAfter, firstSubscribing);

  return (
    <Once
      key={subscribing.times}
      {...props}
      onEvent={(event) => {
        hear("told");
        onEvent(event);
      }}
      rest={restAfter(subscribing)}
      onEnded={hear}
    />
  );
}
