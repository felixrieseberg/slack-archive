import { Message as SlackMessage } from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import { Channel as SlackChannel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { User as SlackUser } from "@slack/web-api/dist/response/UsersInfoResponse";
import { File as SlackFile } from "@slack/web-api/dist/response/FilesInfoResponse";

export type User = SlackUser;

export type Users = Record<string, User>;

export type Message = SlackMessage;

export type Channel = SlackChannel;

export type File = SlackFile;

export type SearchPageIndex =  Record<string, Array<string>>;

export type SearchFile = {
  users: Record<string, string>; // userId -> userName
  channels: Record<string, string>; // channelId -> channelName
  messages: Record<string, Array<SearchMessage>>;
  pages: SearchPageIndex;
};

export type SearchMessage = {
  m?: string; // Message
  u?: string; // User
  t?: string; // Timestamp
  c?: string; // Channel
};
