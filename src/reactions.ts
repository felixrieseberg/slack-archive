import { Message } from "./interfaces";

export function hasReactions(message: Message) {
  return message.reactions && message.reactions.length > 0;
}
