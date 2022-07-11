import fs from "fs-extra";

import {
  ArchiveMessage,
  Channel,
  Message,
  SearchFile,
  Users,
} from "./interfaces.js";
import {
  CHANNELS_DATA_PATH,
  getChannelDataFilePath,
  SEARCH_DATA_PATH,
  USERS_DATA_PATH,
} from "./config.js";

function getFile<T>(filePath: string, returnIfEmpty: T): T {
  if (!fs.existsSync(filePath)) {
    return returnIfEmpty;
  }

  const data: T = fs.readJSONSync(filePath);

  return data;
}

export function getMessages(channelId: string): Array<ArchiveMessage> {
  const filePath = getChannelDataFilePath(channelId);
  return getFile<Array<ArchiveMessage>>(filePath, []);
}

export function getUsers(): Users {
  return getFile<Users>(USERS_DATA_PATH, {});
}

export function getChannels(): Array<Channel> {
  return getFile<Array<Channel>>(CHANNELS_DATA_PATH, []);
}

export function getSearchFile(): SearchFile {
  const returnIfEmpty = { users: {}, channels: {}, messages: {}, pages: {} };

  if (!fs.existsSync(SEARCH_DATA_PATH)) {
    return returnIfEmpty;
  }

  const contents = fs.readFileSync(SEARCH_DATA_PATH, "utf8");

  // See search.ts, the file is actually JS (not JSON)
  return JSON.parse(contents.slice(21, contents.length - 1));
}
