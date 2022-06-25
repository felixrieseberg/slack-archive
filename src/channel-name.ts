import { Channel } from "./interfaces";

export function getChannelName(channel: Channel) {
  return (
    channel.name || channel.id || channel.purpose?.value || "Unknown channel"
  );
}
