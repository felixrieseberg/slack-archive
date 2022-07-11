import { Message } from "./interfaces";

export function isThread(message: Message) {
  return message.reply_count && message.reply_count > 0;
}
