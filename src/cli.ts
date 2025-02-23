import { uniqBy } from "lodash-es";
import inquirer from "inquirer";
import fs from "fs-extra";
import { User } from "@slack/web-api/dist/response/UsersInfoResponse";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import ora from "ora";

import {
  CHANNELS_DATA_PATH,
  USERS_DATA_PATH,
  getChannelDataFilePath,
  OUT_DIR,
  config,
  TOKEN_FILE,
  AUTOMATIC_MODE,
  USE_PREVIOUS_CHANNEL_CONFIG,
  CHANNEL_TYPES,
  DATE_FILE,
  EMOJIS_DATA_PATH,
  NO_SLACK_CONNECT,
} from "./config.js";
import { downloadExtras } from "./messages.js";
import { downloadMessages } from "./messages.js";
import { downloadFilesForChannel } from "./download-files.js";
import {
  createHtmlForChannels,
  getChannelsToCreateFilesFor,
} from "./create-html.js";
import { createBackup, deleteBackup, deleteOlderBackups } from "./backup.js";
import { isValid, parseISO } from "date-fns";
import { createSearch } from "./search.js";
import { write, writeAndMerge } from "./data-write.js";
import { messagesCache, getUsers, getChannels } from "./data-load.js";
import { getSlackArchiveData, setSlackArchiveData } from "./archive-data.js";
import { downloadEmojiList, downloadEmojis } from "./emoji.js";
import { downloadAvatars } from "./users.js";
import { downloadChannels } from "./channels.js";
import { authTest } from "./web-client.js";
import { SlackArchiveChannelData } from "./interfaces.js";

const { prompt } = inquirer;

async function selectMergeFiles(): Promise<boolean> {
  const defaultResponse = true;

  if (!fs.existsSync(CHANNELS_DATA_PATH)) {
    return false;
  }

  // We didn't download any data. Merge.
  if (AUTOMATIC_MODE || NO_SLACK_CONNECT) {
    return defaultResponse;
  }

  const { merge } = await prompt([
    {
      type: "confirm",
      default: defaultResponse,
      name: "merge",
      message: `We've found existing archive files. Do you want to append new data (recommended)? \n If you select "No", we'll delete the existing data.`,
    },
  ]);

  if (!merge) {
    fs.emptyDirSync(OUT_DIR);
  }

  return merge;
}

async function selectChannels(
  channels: Array<Channel>,
  previouslyDownloadedChannels: Record<string, SlackArchiveChannelData>
): Promise<Array<Channel>> {
  if (USE_PREVIOUS_CHANNEL_CONFIG) {
    const selectedChannels: Array<Channel> = channels.filter(
      (channel) => channel.id && channel.id in previouslyDownloadedChannels
    );
    const selectedChannelNames = selectedChannels.map(
      (channel) => channel.name || channel.id || "Unknown"
    );
    console.log(
      `Downloading channels selected previously: ${selectedChannelNames}.`
    );

    const previousChannelIds = Object.keys(previouslyDownloadedChannels);
    if (previousChannelIds.length != selectedChannels.length) {
      console.warn(
        "WARNING: Did not find all previously selected channel IDs."
      );
      console.log(
        `Expected to find ${previousChannelIds.length} channels, but only ${selectedChannels.length} matched.`
      );
      // Consider Looking up the user-facing names of the missing channels in the saved data.
      const availableChannelIds = new Set<string>(
        channels.map((channel) => channel.id || "")
      );
      const missingChannelIds = previousChannelIds.filter(
        (cId) => !availableChannelIds.has(cId)
      );
      //console.log(availableChannelIds);
      console.log(`Missing channel ids: ${missingChannelIds}`);
    } else {
      console.log(
        `Matched all ${previousChannelIds.length} previously selected channels out of ${channels.length} total channels available.`
      );
    }

    return selectedChannels;
  }

  const choices = channels.map((channel) => ({
    name: channel.name || channel.id || "Unknown",
    value: channel,
  }));

  if (AUTOMATIC_MODE || NO_SLACK_CONNECT) {
    return channels;
  }

  const result = await prompt([
    {
      type: "checkbox",
      loop: true,
      name: "channels",
      message: "Which channels do you want to download?",
      choices,
    },
  ]);

  return result.channels;
}

async function selectChannelTypes(): Promise<Array<string>> {
  const choices = [
    {
      name: "Public Channels",
      value: "public_channel",
    },
    {
      name: "Private Channels",
      value: "private_channel",
    },
    {
      name: "Multi-Person Direct Message",
      value: "mpim",
    },
    {
      name: "Direct Messages",
      value: "im",
    },
  ];

  if (CHANNEL_TYPES) {
    return CHANNEL_TYPES.split(",");
  }

  if (AUTOMATIC_MODE || USE_PREVIOUS_CHANNEL_CONFIG || NO_SLACK_CONNECT) {
    return ["public_channel", "private_channel", "mpim", "im"];
  }

  const result = await prompt([
    {
      type: "checkbox",
      loop: true,
      name: "channel-types",
      message: `Which channel types do you want to download?`,
      choices,
    },
  ]);

  return result["channel-types"];
}

async function getToken() {
  if (NO_SLACK_CONNECT) {
    return;
  }

  if (config.token) {
    console.log(`Using token ${config.token}`);
    return;
  }

  if (fs.existsSync(TOKEN_FILE)) {
    config.token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    return;
  }

  const result = await prompt([
    {
      name: "token",
      type: "input",
      message:
        "Please enter your Slack token (xoxp-...). See README for more details.",
    },
  ]);

  config.token = result.token;
}

async function writeLastSuccessfulArchive() {
  const now = new Date();
  write(DATE_FILE, now.toISOString());
}

function getLastSuccessfulRun() {
  if (!fs.existsSync(DATE_FILE)) {
    return "";
  }

  const lastSuccessfulArchive = fs.readFileSync(DATE_FILE, "utf-8");

  let date = null;

  try {
    date = parseISO(lastSuccessfulArchive);
  } catch (error) {
    return "";
  }

  if (date && isValid(date)) {
    return `. Last successful run: ${date.toLocaleString()}`;
  }

  return "";
}

async function getAuthTest() {
  if (NO_SLACK_CONNECT) {
    return;
  }

  const spinner = ora("Testing authentication with Slack...").start();
  const result = await authTest();

  if (!result.ok) {
    spinner.fail(`Authentication with Slack failed.`);

    console.log(
      `Authentication with Slack failed. The error was: ${result.error}`
    );
    console.log(
      `The provided token was ${config.token}. Double-check the token and try again.`
    );
    console.log(
      `For more information on the error code, see the error table at https://api.slack.com/methods/auth.test`
    );
    console.log(`This tool will now exit.`);

    await deleteBackup();
    process.exit(-1);
  } else {
    spinner.succeed(`Successfully authorized with Slack as ${result.user}\n`);
  }

  return result;
}

export async function main() {
  console.log(`Welcome to slack-archive${getLastSuccessfulRun()}`);

  if (AUTOMATIC_MODE) {
    console.log(`Running in fully automatic mode without prompts`);
  }

  if (NO_SLACK_CONNECT) {
    console.log(`Not connecting to Slack and skipping all Slack API calls`);
  }

  await getToken();
  await createBackup();

  const slackArchiveData = await getSlackArchiveData();
  const users: Record<string, User> = await getUsers();
  const channelTypes = (await selectChannelTypes()).join(",");

  slackArchiveData.auth = await getAuthTest();

  const channels = await downloadChannels({ types: channelTypes }, users);
  const selectedChannels = await selectChannels(
    channels,
    slackArchiveData.channels
  );
  const newMessages: Record<string, number> = {};

  // Emoji
  // We don't actually download the images here, we'll
  // do that as needed
  const emojis = await downloadEmojiList();
  await writeAndMerge(EMOJIS_DATA_PATH, emojis);

  // Do we want to merge data?
  await selectMergeFiles();
  await writeAndMerge(CHANNELS_DATA_PATH, selectedChannels);

  // Download messages and extras for each channel
  await downloadEachChannel();

  // Save data
  await setSlackArchiveData(slackArchiveData);

  // Create HTML, but only for channels with new messages
  // - or channels that we didn't make HTML for yet
  const channelsToCreateFilesFor = await getChannelsToCreateFilesFor(
    selectedChannels,
    newMessages
  );
  await createHtmlForChannels(channelsToCreateFilesFor);

  // Create search file
  await createSearch();

  // Cleanup and finalize
  await deleteBackup();
  await deleteOlderBackups();
  await writeLastSuccessfulArchive();

  console.log(`All done.`);

  async function downloadEachChannel() {
    if (NO_SLACK_CONNECT) return;

    for (const [i, channel] of selectedChannels.entries()) {
      if (!channel.id) {
        console.warn(`Selected channel does not have an id`, channel);
        continue;
      }

      // Do we already have everything?
      slackArchiveData.channels[channel.id] =
        slackArchiveData.channels[channel.id] || {};
      if (slackArchiveData.channels[channel.id].fullyDownloaded) {
        continue;
      }

      // Download messages & users
      let downloadData = await downloadMessages(
        channel,
        i,
        selectedChannels.length
      );
      let result = downloadData.messages;
      newMessages[channel.id] = downloadData.new;

      await downloadExtras(channel, result, users);
      await downloadEmojis(result, emojis);
      await downloadAvatars();

      // Sort messages
      const spinner = ora(
        `Saving message data for ${channel.name || channel.id} to disk`
      ).start();
      spinner.render();

      result = uniqBy(result, "ts");
      result = result.sort((a, b) => {
        return parseFloat(b.ts || "0") - parseFloat(a.ts || "0");
      });

      await writeAndMerge(USERS_DATA_PATH, users);
      fs.outputFileSync(
        getChannelDataFilePath(channel.id),
        JSON.stringify(result, undefined, 2)
      );

      // Download files. This needs to run after the messages are saved to disk
      // since it uses the message data to find which files to download.
      await downloadFilesForChannel(channel.id!, spinner);

      // Update the data load cache
      messagesCache[channel.id!] = result;

      // Update the data
      const { is_archived, is_im, is_user_deleted } = channel;
      if (is_archived || (is_im && is_user_deleted)) {
        slackArchiveData.channels[channel.id].fullyDownloaded = true;
      }
      slackArchiveData.channels[channel.id].messages = result.length;

      spinner.succeed(`Saved message data for ${channel.name || channel.id}`);
    }
  }
}

main();
