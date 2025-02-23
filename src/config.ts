import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  token: process.env.SLACK_TOKEN,
};

function findCliParameter(param: string) {
  const args = process.argv;

  for (const arg of args) {
    if (arg === param) {
      return true;
    }
  }

  return false;
}

function getCliParameter(param: string) {
  const args = process.argv;

  for (const [i, arg] of args.entries()) {
    if (arg === param) {
      return args[i + 1];
    }
  }

  return null;
}

export const AUTOMATIC_MODE = findCliParameter("--automatic");
export const USE_PREVIOUS_CHANNEL_CONFIG = findCliParameter(
  "--use-previous-channel-config"
);
export const CHANNEL_TYPES = getCliParameter("--channel-types");
export const NO_BACKUP = findCliParameter("--no-backup");
export const NO_SEARCH = findCliParameter("--no-search");
export const NO_FILE_DOWNLOAD = findCliParameter("--no-file-download");
export const NO_SLACK_CONNECT = findCliParameter("--no-slack-connect");
export const FORCE_HTML_GENERATION = findCliParameter(
  "--force-html-generation"
);
export const BASE_DIR = process.cwd();
export const OUT_DIR = path.join(BASE_DIR, "slack-archive");
export const TOKEN_FILE = path.join(OUT_DIR, ".token");
export const DATE_FILE = path.join(OUT_DIR, ".last-successful-run");
export const DATA_DIR = path.join(OUT_DIR, "data");
export const HTML_DIR = path.join(OUT_DIR, "html");
export const FILES_DIR = path.join(HTML_DIR, "files");
export const AVATARS_DIR = path.join(HTML_DIR, "avatars");
export const EMOJIS_DIR = path.join(HTML_DIR, "emojis");

export const INDEX_PATH = path.join(OUT_DIR, "index.html");
export const SEARCH_PATH = path.join(OUT_DIR, "search.html");
export const MESSAGES_JS_PATH = path.join(__dirname, "../static/scroll.js");
export const SEARCH_TEMPLATE_PATH = path.join(
  __dirname,
  "../static/search.html"
);
export const CHANNELS_DATA_PATH = path.join(DATA_DIR, "channels.json");
export const USERS_DATA_PATH = path.join(DATA_DIR, "users.json");
export const EMOJIS_DATA_PATH = path.join(DATA_DIR, "emojis.json");
export const SLACK_ARCHIVE_DATA_PATH = path.join(
  DATA_DIR,
  "slack-archive.json"
);
export const SEARCH_DATA_PATH = path.join(DATA_DIR, "search.js");

export function getChannelDataFilePath(channelId: string) {
  return path.join(DATA_DIR, `${channelId}.json`);
}

export function getChannelUploadFilePath(channelId: string, fileName: string) {
  return path.join(FILES_DIR, channelId, fileName);
}

export function getHTMLFilePath(channelId: string, index: number) {
  return path.join(HTML_DIR, `${channelId}-${index}.html`);
}

export function getAvatarFilePath(userId: string, extension: string) {
  return path.join(AVATARS_DIR, `${userId}${extension}`);
}
