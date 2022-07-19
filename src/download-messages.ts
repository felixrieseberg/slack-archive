import {
  ConversationsHistoryResponse,
  ConversationsListArguments,
  ConversationsListResponse,
  WebClient,
} from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { User } from "@slack/web-api/dist/response/UsersInfoResponse";
import ora from "ora";

import { config } from "./config.js";
import { ArchiveMessage, Message, Users } from "./interfaces.js";
import { getMessages } from "./data-load.js";
import { isThread } from "./threads.js";

let _webClient: WebClient;
function getWebClient() {
  if (_webClient) return _webClient;

  const { token } = config;
  return (_webClient = new WebClient(token));
}

function isConversation(input: any): input is ConversationsHistoryResponse {
  return !!input.messages;
}

function isChannels(input: any): input is ConversationsListResponse {
  return !!input.channels;
}

async function downloadUser(
  item: Message | any,
  users: Users
): Promise<User | null> {
  if (!item.user) return null;
  if (users[item.user]) return users[item.user];

  console.log(`Downloading info for user ${item.user}...`);

  const user = (
    await getWebClient().users.info({
      user: item.user,
    })
  ).user;

  if (user) {
    return (users[item.user] = user);
  }

  return null;
}

export async function downloadChannels(
  options: ConversationsListArguments,
  users: Users
): Promise<Array<Channel>> {
  const channels = [];

  for await (const page of getWebClient().paginate(
    "conversations.list",
    options
  )) {
    if (isChannels(page)) {
      console.log(
        `Found ${page.channels?.length} channels (found so far: ${
          channels.length + (page.channels?.length || 0)
        })`
      );

      const pageChannels = (page.channels || []).filter((c) => !!c.id);

      for (const channel of pageChannels) {
        if (channel.is_im) {
          const user = await downloadUser(channel, users);
          const realUserName = user?.real_name ? ` (${user?.real_name})` : "";
          channel.name = channel.name || `${user?.name}${realUserName}`;
        }

        if (channel.is_mpim) {
          channel.name = channel.purpose?.value;
        }
      }

      channels.push(...pageChannels);
    }
  }

  return channels;
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
    `Downloading ${i + 1}/${channelCount} ${name}...`
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

  spinner.succeed(`Downloaded ${i + 1}/${channelCount} ${name}...`);

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

  let processedThreads = 0;
  const totalThreads = messages.filter(isThread).length;
  for (const message of messages) {
    if (isThread(message)) {
      processedThreads++;
      spinner.text = `Downloading threads (${processedThreads}/${totalThreads}) for ${
        channel.name || channel.id
      }...`;
      message.replies = await downloadReplies(channel, message);
    }

    if (message.user && users[message.user] === undefined) {
      const usr = await downloadUser(message, users);
      if (usr) {
        users[message.user] = usr;
      }
    }
  }

  spinner.succeed(
    `Downloaded ${totalThreads} threads and users for ${
      channel.name || channel.id
    }.`
  );
}
