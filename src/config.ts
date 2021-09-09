import { ensureDirSync } from "fs-extra";
import path from "path";

export let token = process.env.SLACK_TOKEN;

export const OUT_DIR = path.join(__dirname, "../out");
export const DATA_DIR = path.join(OUT_DIR, "data");
export const HTML_DIR = path.join(OUT_DIR, "html");
export const FILES_DIR = path.join(HTML_DIR, "files");
export const AVATARS_DIR = path.join(HTML_DIR, "avatars");

export const INDEX_PATH = path.join(OUT_DIR, "index.html");
export const CHANNELS_DATA_PATH = path.join(DATA_DIR, "channels.json");
export const USERS_DATA_PATH = path.join(DATA_DIR, "users.json");

export function getChannelDataFilePath(channelId: string) {
  return path.join(DATA_DIR, `${channelId}.json`);
}

export function getChannelUploadFilePath(channelId: string, fileName: string) {
  return path.join(FILES_DIR, channelId, fileName);
}

export function getHTMLFilePath(channelId: string, index: number) {
  return path.join(HTML_DIR, `${channelId}-${index}.html`);
}

export function getAvatarFilePath(userId: string) {
  return path.join(AVATARS_DIR, `${userId}.png`);
}
