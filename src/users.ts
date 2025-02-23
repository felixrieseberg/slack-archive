import path from "path";

import { getWebClient } from "./web-client.js";
import { Message, User, Users } from "./interfaces.js";
import { getAvatarFilePath } from "./config.js";
import { getUsers } from "./data-load.js";
import { downloadURL } from "./download-files.js";
import ora from "ora";

// We'll redownload users every run, but only once per user
// To keep track, we'll keep the ids in this array
export const usersRefetchedThisRun: Array<string> = [];
export const avatarsRefetchedThisRun: Array<string> = [];

export async function downloadUser(
  item: Message | any,
  users: Users
): Promise<User | null> {
  if (!item.user) return null;

  // If we already have this user *and* downloaded them before,
  // return cached version
  if (users[item.user] && usersRefetchedThisRun.includes(item.user))
    return users[item.user];

  const spinner = ora(`Downloading info for user ${item.user}...`).start();
  const user = (item.user === 'U00') ? {} as User : (
      await getWebClient().users.info({
        user: item.user,
      })
    ).user;

  if (user) {
    usersRefetchedThisRun.push(item.user);
    spinner.succeed(`Downloaded info for user ${item.user} (${user.name})`);
    return (users[item.user] = user);
  }

  return null;
}

export async function downloadAvatars() {
  const users = await getUsers();
  const userIds = Object.keys(users);
  const spinner = ora(`Downloading avatars (0/${userIds.length})`).start();

  for (const [i, userId] of userIds.entries()) {
    spinner.text = `Downloading avatars (${i + 1}/${userIds.length})`;
    await downloadAvatarForUser(users[userId]);
  }

  spinner.stop();
}

export async function downloadAvatarForUser(user?: User | null) {
  if (!user || !user.id || avatarsRefetchedThisRun.includes(user.id)) {
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
    await downloadURL(profile.image_512, filePath, {
      authorize: false,
      force: true,
    });
    avatarsRefetchedThisRun.push(user.id!);
  } catch (error) {
    console.warn(`Failed to download avatar for user ${user.id!}`, error);
  }
}

export function getName(userId: string | undefined, users: Users) {
  if (!userId) return "Unknown";
  const user = users[userId];
  if (!user) return userId;

  return user.profile?.display_name || user.profile?.real_name || user.name;
}
