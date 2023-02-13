import {
  ConversationsHistoryResponse,
  ConversationsListArguments,
  ConversationsListResponse,
} from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import ora from "ora";

import { ArchiveMessage, Message, Users } from "./interfaces.js";
import { getMessages } from "./data-load.js";
import { isThread } from "./threads.js";
import { downloadUser, getName } from "./users.js";
import { getWebClient } from "./web-client.js";

function isConversation(input: any): input is ConversationsHistoryResponse {
  return !!input.messages;
}

interface DownloadMessagesResult {
  messages: Array<ArchiveMessage>;
  new: number;
}

export async function downloadMessages(
  channel: Channel,
  i: number,
  channelCount: number
): Promise<DownloadMessagesResult> {
  let result: DownloadMessagesResult = {
    messages: [],
    new: 0,
  };

  if (!channel.id) {
    console.warn(`Channel without id`, channel);
    return result;
  }

  for (const message of await getMessages(channel.id)) {
    result.messages.push(message);
  }

  const oldest =
    result.messages.length > 0 ? parseInt(result.messages[0].ts || "0", 10) : 0;
  const name =
    channel.name || channel.id || channel.purpose?.value || "Unknown channel";

  const spinner = ora(
    `Downloading messages for channel ${i + 1}/${channelCount} (${name})...`
  ).start();

  for await (const page of getWebClient().paginate("conversations.history", {
    channel: channel.id,
    oldest,
  })) {
    if (isConversation(page)) {
      const pageLength = page.messages?.length || 0;
      const fetched = `Fetched ${pageLength} messages`;
      const total = `(total so far: ${result.messages.length + pageLength}`;

      spinner.text = `Downloading ${
        i + 1
      }/${channelCount} ${name}: ${fetched} ${total})`;

      result.new = result.new + (page.messages || []).length;

      result.messages.unshift(...(page.messages || []));
    }
  }

  spinner.succeed(
    `Downloaded messages for channel ${i + 1}/${channelCount} (${name})`
  );

  return result;
}

export async function downloadReplies(
  channel: Channel,
  message: ArchiveMessage
): Promise<Array<Message>> {
  if (!channel.id || !message.ts) {
    console.warn("Could not find channel or message id", channel, message);
    return [];
  }

  if (!message.reply_count) {
    console.warn("Message has no reply count", message);
    return [];
  }

  // Do we already have all replies?
  if (message.replies && message.replies.length >= message.reply_count) {
    return message.replies;
  }

  const replies = message.replies || [];
  // Oldest is the last entry
  const oldest = replies.length > 0 ? replies[replies.length - 1].ts : "0";
  const result = await getWebClient().conversations.replies({
    channel: channel.id,
    ts: message.ts,
    oldest,
  });

  // First message is the parent
  return (result.messages || []).slice(1);
}

export async function downloadExtras(
  channel: Channel,
  messages: Array<ArchiveMessage>,
  users: Users
) {
  const spinner = ora(
    `Downloading threads and users for ${channel.name || channel.id}...`
  ).start();

  // Then, all messages and threads
  let processedThreads = 0;
  const totalThreads = messages.filter(isThread).length;
  for (const message of messages) {
    // Download threads
    if (isThread(message)) {
      processedThreads++;
      spinner.text = `Downloading threads (${processedThreads}/${totalThreads}) for ${
        channel.name || channel.id
      }...`;
      message.replies = await downloadReplies(channel, message);
    }

    // Download users and avatars
    if (message.user) {
      await downloadUser(message, users);
    }
  }

  spinner.succeed(
    `Downloaded ${totalThreads} threads and users for ${
      channel.name || channel.id
    }.`
  );
}
