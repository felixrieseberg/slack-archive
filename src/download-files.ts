import fetch from "node-fetch";
import fs from "fs-extra";
import esMain from "es-main";
import ora, { Ora } from "ora";
import path from "path";

import { File, Message, User } from "./interfaces.js";
import {
  getAvatarFilePath,
  getChannelUploadFilePath,
  config,
} from "./config.js";
import { getChannels, getMessages, getUsers } from "./data-load.js";

async function downloadURL(
  url: string,
  filePath: string,
  authorize: boolean = true
) {
  if (fs.existsSync(filePath)) {
    return;
  }

  const { token } = config;
  const headers: HeadersInit = authorize
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  try {
    const response = await fetch(url, { headers });
    const buffer = await response.buffer();
    fs.outputFileSync(filePath, buffer);
  } catch (error) {
    console.warn(`Failed to download file ${url}`, error);
  }
}

async function downloadFile(
  file: File,
  channelId: string,
  i: number,
  total: number,
  spinner: Ora
) {
  const { url_private, id, is_external, mimetype } = file;
  const { thumb_1024, thumb_720, thumb_480, thumb_pdf } = file as any;

  const fileUrl = is_external
    ? thumb_1024 || thumb_720 || thumb_480 || thumb_pdf
    : url_private;

  if (!fileUrl) return;

  spinner.text = `Downloading ${i}/${total}: ${fileUrl}`;

  const extension = path.extname(fileUrl);
  const filePath = getChannelUploadFilePath(channelId, `${id}${extension}`);

  await downloadURL(fileUrl, filePath);

  if (mimetype === "application/pdf" && thumb_pdf) {
    spinner.text = `Downloading ${i}/${total}: ${thumb_pdf}`;
    const thumbFile = filePath.replace(extension, ".png");
    await downloadURL(thumb_pdf, thumbFile);
  }
}

export async function downloadFilesForChannel(channelId: string) {
  const messages = await getMessages(channelId);
  const channels = await getChannels();
  const channel = channels.find(({ id }) => id === channelId);
  const fileMessages = messages.filter(
    (m) => (m.files?.length || m.replies?.length || 0) > 0
  );
  const getSpinnerText = (i: number, ri?: number) => {
    let reply = "";
    if (ri !== undefined) {
      reply = ` (reply ${ri})`;
    }

    return `Downloading ${i}/${
      fileMessages.length
    }${reply} messages with files for channel ${channel?.name || channelId}...`;
  };

  const spinner = ora(getSpinnerText(0)).start();

  for (const [i, fileMessage] of fileMessages.entries()) {
    if (!fileMessage.files && !fileMessage.replies) {
      continue;
    }

    if (fileMessage.files) {
      for (const file of fileMessage.files) {
        spinner.text = getSpinnerText(i);
        spinner.render();
        await downloadFile(file, channelId, i, fileMessages.length, spinner);
      }
    }

    if (fileMessage.replies) {
      for (const [ri, reply] of fileMessage.replies.entries()) {
        if (reply.files) {
          for (const file of reply.files) {
            spinner.text = getSpinnerText(i, ri);
            spinner.render();
            await downloadFile(
              file,
              channelId,
              i,
              fileMessages.length,
              spinner
            );
          }
        }
      }
    }
  }

  spinner.succeed(
    `Downloaded files for channel ${channel?.name || channelId}.`
  );
}

export async function downloadAvatars() {
  const users = await getUsers();
  const userIds = Object.keys(users);

  for (const userId of userIds) {
    await downloadAvatarForUser(users[userId]);
  }
}

export async function downloadAvatarForUser(user?: User | null) {
  if (!user) {
    return;
  }

  const { profile } = user;

  if (!profile || !profile.image_512) {
    return;
  }

  try {
    const filePath = getAvatarFilePath(
      user.id!,
      path.extname(profile.image_512)
    );
    downloadURL(profile.image_512, filePath, false);
  } catch (error) {
    console.warn(`Failed to download avatar for user ${user.id!}`, error);
  }
}

async function main() {
  const lastArg = process.argv[process.argv.length - 1];

  if (lastArg === "avatars") {
    console.log(`Downloading avatars`);
    await downloadAvatars();
  }

  if (lastArg === "channels") {
    console.log(`Downloading files for channels`);
    const channels = await getChannels();

    for (const channel of channels) {
      if (channel.id) {
        downloadFilesForChannel(channel.id);
      }
    }
  }
}

if (esMain(import.meta)) {
  main();
}
