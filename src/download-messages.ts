import {
  ConversationsHistoryResponse,
  ConversationsListArguments,
  ConversationsListResponse,
  WebClient,
} from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { User } from "@slack/web-api/dist/response/UsersInfoResponse";

import { config } from "./config";
import { Message, Users } from "./interfaces";
import { getMessages, getUsers } from "./load-data";
import { clearLastLine } from "./log-line";

let _webClient: WebClient;
function getWebClient() {
  if (_webClient) return _webClient;

  const { token } = config;
  return (_webClient = new WebClient(token));
}

const users: Users = getUsers();

function isConversation(input: any): input is ConversationsHistoryResponse {
  return !!input.messages;
}

function isChannels(input: any): input is ConversationsListResponse {
  return !!input.channels;
}

export async function downloadUser(item: Message | any): Promise<User | null> {
  if (!item.user) return null;
  if (users[item.user]) return users[item.user];

  clearLastLine();
  console.log(`Downloading info for user ${item.user}...`);

  const user = (
    await getWebClient().users.info({
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

  for await (const page of getWebClient().paginate(
    "conversations.list",
    options
  )) {
    if (isChannels(page)) {
      clearLastLine();
      console.log(
        `Found ${page.channels?.length} channels (found so far: ${
          channels.length + (page.channels?.length || 0)
        })`
      );

      const pageChannels = (page.channels || []).filter((c) => !!c.id);

      for (const channel of pageChannels) {
        if (channel.is_im) {
          const user = await downloadUser(channel);
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

export async function downloadMessages(
  channel: Channel
): Promise<Array<Message>> {
  const result: Array<Message> = [];

  if (!channel.id) {
    console.warn(`Channel without id`, channel);
    return result;
  }

  result.push(...getMessages(channel.id));

  const oldest = result.length > 0 ? parseInt(result[0].ts || "0", 10) : 0;
  const name =
    channel.name || channel.id || channel.purpose?.value || "Unknown channel";

  console.log(`Downloading ${name}...`);

  for await (const page of getWebClient().paginate("conversations.history", {
    channel: channel.id,
    oldest,
  })) {
    if (isConversation(page)) {
      clearLastLine();

      const pageLength = page.messages?.length || 0;
      const fetched = `Fetched ${pageLength} messages`;
      const total = `(total so far: ${result.length + pageLength}`;

      console.log(`Downloading ${name}: ${fetched} ${total})`);
      result.push(...(page.messages || []));
    }
  }

  return result;
}
