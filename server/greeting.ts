import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { greetingRpc } from "../shared/greeting";

export function createGreeting({
  name,
}: RpcInput<typeof greetingRpc>): RpcOutput<typeof greetingRpc> {
  return { message: `Hello, ${name}!` };
}
