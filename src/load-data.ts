import fs from "fs-extra";

import { Channel, Message, Users } from "./interfaces.js";
import {
  CHANNELS_DATA_PATH,
  getChannelDataFilePath,
  USERS_DATA_PATH,
} from "./config.js";

function getFile<T>(filePath: string, returnIfEmpty: T): T {
  if (!fs.existsSync(filePath)) {
    return returnIfEmpty;
  }

  const data: T = fs.readJSONSync(filePath);

  return data;
}

export function getMessages(channelId: string): Array<Message> {
  const filePath = getChannelDataFilePath(channelId);
  return getFile<Array<Message>>(filePath, []);
}

export function getUsers(): Users {
  return getFile<Users>(USERS_DATA_PATH, {});
}

export function getChannels(): Array<Channel> {
  return getFile<Array<Channel>>(CHANNELS_DATA_PATH, []);
}
