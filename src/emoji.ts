import path from "path";
import ora from "ora";
import fs from "fs";
import { createRequire } from "node:module";

import { EMOJIS_DIR, NO_SLACK_CONNECT } from "./config.js";
import { downloadURL } from "./download-files.js";
import { ArchiveMessage, Emojis } from "./interfaces.js";
import { getWebClient } from "./web-client.js";

const require = createRequire(import.meta.url);
const emojiData = require("emoji-datasource");

let _unicodeEmoji: Record<string, string>;
function getUnicodeEmoji() {
  if (_unicodeEmoji) {
    return _unicodeEmoji;
  }

  _unicodeEmoji = {};
  for (const emoji of emojiData) {
    _unicodeEmoji[emoji.short_name as string] = emoji.unified;
  }

  return _unicodeEmoji;
}

export function getEmojiFilePath(name: string, extension?: string) {
  // If we have an extension, return the correct path
  if (extension) {
    return path.join(EMOJIS_DIR, `${name}${extension}`);
  }

  // If we don't have an extension, return the first path that exists
  // regardless of extension
  const extensions = [".png", ".jpg", ".gif"];
  for (const ext of extensions) {
    if (fs.existsSync(path.join(EMOJIS_DIR, `${name}${ext}`))) {
      return path.join(EMOJIS_DIR, `${name}${ext}`);
    }
  }
}

export function isEmojiUnicode(name: string) {
  const unicodeEmoji = getUnicodeEmoji();
  return !!unicodeEmoji[name];
}

export function getEmojiUnicode(name: string) {
  const unicodeEmoji = getUnicodeEmoji();
  const unified = unicodeEmoji[name];
  const split = unified.split("-");

  return split
    .map((code) => {
      return String.fromCodePoint(parseInt(code, 16));
    })
    .join("");
}

export async function downloadEmojiList(): Promise<Emojis> {
  if (NO_SLACK_CONNECT) {
    return {};
  }

  const response = await getWebClient().emoji.list();

  if (response.ok) {
    return response.emoji!;
  } else {
    return {};
  }
}

export async function downloadEmoji(
  name: string,
  url: string,
  emojis: Emojis
): Promise<void> {
  // Alias?
  if (url.startsWith("alias:")) {
    const alias = getEmojiAlias(url);

    if (!emojis[alias]) {
      console.warn(
        `Found emoji alias ${alias}, which does not exist in master emoji list`
      );
      return;
    } else {
      return downloadEmoji(alias, emojis[alias], emojis);
    }
  }

  const extension = path.extname(url);
  const filePath = getEmojiFilePath(name, extension);

  return downloadURL(url, filePath!);
}

export function getEmojiAlias(name: string): string {
  // Ugh regex methods - this should turn "alias:hi-bob" into "hi-bob"
  const alias = [...name.matchAll(/alias:(.*)/g)][0][1]!;
  return alias!;
}

export async function downloadEmojis(
  messages: Array<ArchiveMessage>,
  emojis: Emojis
) {
  const regex = /:[^:\s]*(?:::[^:\s]*)*:/g;

  const spinner = ora(
    `Scanning 0/${messages.length} messages for emoji shortcodes...`
  ).start();
  let downloaded = 0;

  for (const [i, message] of messages.entries()) {
    spinner.text = `Scanning ${i}/${messages.length} messages for emoji shortcodes...`;

    // Reactions
    if (message.reactions && message.reactions.length > 0) {
      for (const reaction of message.reactions) {
        const reactEmoji = emojis[reaction.name!];
        if (reactEmoji) {
          downloaded++;
          await downloadEmoji(reaction.name!, reactEmoji, emojis);
        }
      }
    }
  }

  spinner.succeed(
    `Scanned ${messages.length} messages for emoji (and downloaded ${downloaded})`
  );
}
