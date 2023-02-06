import fs from "fs-extra";

import {
  ArchiveMessage,
  Channel,
  Emojis,
  SearchFile,
  Users,
} from "./interfaces.js";
import {
  CHANNELS_DATA_PATH,
  EMOJIS_DATA_PATH,
  getChannelDataFilePath,
  SEARCH_DATA_PATH,
  USERS_DATA_PATH,
} from "./config.js";
import { retry } from "./retry.js";

async function getFile<T>(filePath: string, returnIfEmpty: T): Promise<T> {
  if (!fs.existsSync(filePath)) {
    return returnIfEmpty;
  }

  const data: T = await readJSON(filePath);

  return data;
}

export const messagesCache: Record<string, Array<ArchiveMessage>> = {};

export async function getMessages(
  channelId: string,
  cachedOk: boolean = false
): Promise<Array<ArchiveMessage>> {
  if (cachedOk && messagesCache[channelId]) {
    return messagesCache[channelId];
  }

  const filePath = getChannelDataFilePath(channelId);
  messagesCache[channelId] = await getFile<Array<ArchiveMessage>>(filePath, []);

  return messagesCache[channelId];
}

export async function getUsers(): Promise<Users> {
  return getFile<Users>(USERS_DATA_PATH, {});
}

export async function getEmoji(): Promise<Emojis> {
  return getFile<Emojis>(EMOJIS_DATA_PATH, {});
}

export async function getChannels(): Promise<Array<Channel>> {
  return getFile<Array<Channel>>(CHANNELS_DATA_PATH, []);
}

export async function getSearchFile(): Promise<SearchFile> {
  const returnIfEmpty = { users: {}, channels: {}, messages: {}, pages: {} };

  if (!fs.existsSync(SEARCH_DATA_PATH)) {
    return returnIfEmpty;
  }

  const contents = await readFile(SEARCH_DATA_PATH, "utf8");

  // See search.ts, the file is actually JS (not JSON)
  return JSON.parse(contents.slice(21, contents.length - 1));
}

export async function readFile(filePath: string, encoding = "utf8") {
  return retry<string>({ name: `Reading ${filePath}` }, () => {
    return fs.readFileSync(SEARCH_DATA_PATH, "utf8");
  });
}

export async function readJSON<T>(filePath: string) {
  return retry<T>({ name: `Loading JSON from ${filePath}` }, () => {
    return fs.readJSONSync(filePath);
  });
}
