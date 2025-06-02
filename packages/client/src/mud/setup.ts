/*
 * This file sets up all the definitions required for a MUD client.
 */

import { createSystemCalls } from "./createSystemCalls.js";
import { setupNetwork } from "./setupNetwork.js";

export type SetupResult = Awaited<ReturnType<typeof setup>>;

export async function setup() {
  const network = await setupNetwork();
  const systemCalls = createSystemCalls(network);

  return {
    network,
    systemCalls,
  };
}
