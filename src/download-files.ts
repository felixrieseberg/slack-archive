import fetch from "node-fetch";
import fs from "fs-extra";

import { File, User } from "./interfaces";
import { getAvatarFilePath, getChannelUploadFilePath, config } from "./config";
import { getChannels, getMessages, getUsers } from "./load-data";
import path from "path";

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

async function downloadFile(file: File, channelId: string) {
  const { url_private, id, is_external, mimetype } = file;
  const { thumb_1024, thumb_720, thumb_480, thumb_pdf } = file as any;

  const fileUrl = is_external
    ? thumb_1024 || thumb_720 || thumb_480 || thumb_pdf
    : url_private;

  if (!fileUrl) return;

  console.log(`Downloading ${fileUrl}`);

  const extension = path.extname(fileUrl);
  const filePath = getChannelUploadFilePath(channelId, `${id}${extension}`);

  await downloadURL(fileUrl, filePath);

  if (mimetype === "application/pdf" && thumb_pdf) {
    console.log(`Downloading ${thumb_pdf}`);
    const thumbFile = filePath.replace(extension, ".png");
    await downloadURL(thumb_pdf, thumbFile);
  }
}

export async function downloadFilesForChannel(channelId: string) {
  const messages = getMessages(channelId);
  const channels = getChannels();
  const channel = channels.find(({ id }) => id === channelId);
  const fileMessages = messages.filter((m) => (m.files?.length || 0) > 0);

  console.log(`Downloading files for channel ${channel?.name || channelId}...`);

  for (const fileMessage of fileMessages) {
    if (!fileMessage.files) {
      continue;
    }

    for (const file of fileMessage.files) {
      await downloadFile(file, channelId);
    }
  }
}

export async function downloadAvatars() {
  const users = getUsers();
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
    const channels = getChannels();

    for (const channel of channels) {
      if (channel.id) {
        downloadFilesForChannel(channel.id);
      }
    }
  }
}

if (require.main?.filename === __filename) {
  main();
}
