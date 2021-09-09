import fetch from "node-fetch";
import fs from "fs-extra";

import { File, User } from "./interfaces";
import { getAvatarFilePath, getChannelUploadFilePath, token } from "./config";
import { getChannels, getMessages, getUsers } from "./load-data";

async function downloadURL(url: string, filePath: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const buffer = await response.buffer();
  fs.outputFileSync(filePath, buffer);
}

async function downloadFile(
  file: File,
  channelId: string,
  channelName?: string
) {
  const { url_private, id, filetype } = file;

  if (!url_private) return;

  console.log(`Downloading ${url_private}`);

  const extension = filetype ? `.${filetype}` : "";
  const filePath = getChannelUploadFilePath(channelId, `${id}${extension}`);

  await downloadURL(url_private, filePath);
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
    downloadURL(profile.image_512, getAvatarFilePath(user.id!));
  } catch (error) {
    console.warn(`Failed to download avatar for user ${user.id!}`, error);
  }
}
