import {
  ConversationsHistoryResponse,
  ConversationsListArguments,
  ConversationsListResponse,
  WebClient,
} from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { User } from "@slack/web-api/dist/response/UsersInfoResponse";

import { token } from "./config";
import { downloadAvatarForUser } from "./download-files";
import { Message } from "./interfaces";
import { clearLastLine } from "./log-line";

const web = new WebClient(token);
const users: Record<string, User> = {};

function isConversation(input: any): input is ConversationsHistoryResponse {
  return !!input.messages;
}

function isChannels(input: any): input is ConversationsListResponse {
  return !!input.channels;
}

export async function downloadUser(
  item: Message | any,
  downloadAvatar?: boolean
): Promise<User | null> {
  if (!item.user) return null;
  if (users[item.user]) return users[item.user];

  clearLastLine();
  console.log(`Downloading info for user ${item.user}...`);

  const user = (
    await web.users.info({
      user: item.user,
    })
  ).user;

  if (user) {
    return (users[item.user] = user);
  } else {
    return null;
  }
}

export async function downloadChannels(
  options?: ConversationsListArguments
): Promise<Array<Channel>> {
  const channels = [];

  for await (const page of web.paginate("conversations.list", options)) {
    if (isChannels(page)) {
      clearLastLine();
      console.log(
        `Found ${page.channels?.length} channels (found so far: ${
          channels.length + (page.channels?.length || 0)
        })`
      );

      const pageChannels = page.channels || [];

      for (const channel of pageChannels) {
        if (channel.is_im) {
          const user = await downloadUser(channel);
          channel.name = channel.name || `${user?.name} (${user?.real_name})`;
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

export async function downloadMessages(
  channel: Channel
): Promise<Array<Message>> {
  const result: Array<Message> = [];

  if (!channel.id) {
    console.warn(`Channel without id`, channel);
    return result;
  }

  const name =
    channel.name || channel.id || channel.purpose?.value || "Unknown channel";

  console.log(`Downloading ${name}...`);

  for await (const page of web.paginate("conversations.history", {
    channel: channel.id,
  })) {
    if (isConversation(page)) {
      clearLastLine();
      console.log(
        `Downloading ${name}: Found ${page.messages?.length} messages (total so far: ${result.length})`
      );
      result.push(...(page.messages || []));
    }
  }

  return result;
}
