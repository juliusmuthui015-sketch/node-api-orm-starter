/*
|--------------------------------------------------------------------------
| Broadcasting Module Exports
|--------------------------------------------------------------------------
|
| Export all broadcasting-related classes and utilities.
|
*/

// Types
export * from "./types";

// Channel classes
export {
  Channel,
  PublicChannel,
  PrivateChannel,
  PresenceChannel,
  channelRegistry,
  channel,
  Channels,
  ChannelAuthorizer,
  PresenceChannelResult,
  ChannelRoute,
} from "./Channel";

// Broadcast Manager
export {
  BroadcastManager,
  PendingBroadcast,
  getBroadcastManager,
  setBroadcastManager,
  broadcast,
} from "./BroadcastManager";

// Broadcast Facade
export { Broadcast, Broadcast as default } from "./BroadcastFacade";

// WebSocket Broadcaster
export { WebSocketBroadcaster } from "./WebSocketBroadcaster";

// Decorators
export {
  ShouldBroadcast,
  BroadcastAs,
  BroadcastWhen,
  BroadcastWith,
  BroadcastToOthers,
  isBroadcastable,
  shouldBroadcastToOthers,
} from "./BroadcastDecorators";
