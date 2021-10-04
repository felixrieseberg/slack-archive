import { uniqBy } from "lodash-es";
import inquirer from "inquirer";
import fs from "fs-extra";
import { User } from "@slack/web-api/dist/response/UsersInfoResponse";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

import {
  CHANNELS_DATA_PATH,
  USERS_DATA_PATH,
  getChannelDataFilePath,
  OUT_DIR,
  config,
  TOKEN_FILE,
} from "./config.js";
import { downloadChannels, downloadUser } from "./download-messages.js";
import { downloadMessages } from "./download-messages.js";
import { downloadAvatars, downloadFilesForChannel } from "./download-files.js";
import { createHtmlForChannels } from "./create-html.js";

const { prompt } = inquirer;

async function selectMergeFiles(): Promise<boolean> {
  if (!fs.existsSync(CHANNELS_DATA_PATH)) {
    return false;
  }

  const { merge } = await prompt([
    {
      type: "confirm",
      default: true,
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
  channels: Array<Channel>
): Promise<Array<Channel>> {
  const choices = channels.map((channel) => ({
    name: channel.name || channel.id || "Unknown",
    value: channel,
  }));

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

function writeAndMerge(filePath: string, newData: any) {
  let dataToWrite = newData;

  if (fs.existsSync(filePath)) {
    const oldData = fs.readJSONSync(filePath);

    if (Array.isArray(oldData)) {
      dataToWrite = [...oldData, ...newData];

      if (newData[0].id) {
        dataToWrite = uniqBy(dataToWrite, (v: any) => v.id);
      }
    } else if (typeof newData === "object") {
      dataToWrite = { ...oldData, ...newData };
    } else {
      console.error(`writeAndMerge: Did not understand type of data`, {
        filePath,
        newData,
      });
    }
  }

  fs.outputFileSync(filePath, JSON.stringify(dataToWrite, undefined, 2));
}

async function getToken() {
  if (config.token) {
    console.log(`Using token ${config.token}`);
    return;
  }

  if (fs.existsSync(TOKEN_FILE)) {
    config.token = fs.readFileSync(TOKEN_FILE, "utf-8");
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

export async function main() {
  console.log(`Welcome to slack-archive`);

  await getToken();

  const users: Record<string, User | null> = {};
  const channelTypes = (await selectChannelTypes()).join(",");

  console.log(`Downloading channels...\n`);
  const channels = await downloadChannels({ types: channelTypes });
  const selectedChannels = await selectChannels(channels);

  // Do we want to merge data?
  await selectMergeFiles();

  writeAndMerge(CHANNELS_DATA_PATH, selectedChannels);

  for (const [i, channel] of selectedChannels.entries()) {
    if (!channel.id) {
      console.warn(`Selected channel does not have an id`, channel);
      continue;
    }

    // Download messages & users
    let result = await downloadMessages(channel, i, selectedChannels.length);
    for (const message of result) {
      if (message.user && users[message.user] === undefined) {
        users[message.user] = await downloadUser(message);
      }
    }

    // Sort messages
    result = uniqBy(result, "ts");
    result = result.sort((a, b) => {
      return parseFloat(b.ts || "0") - parseFloat(a.ts || "0");
    });

    writeAndMerge(USERS_DATA_PATH, users);
    fs.outputFileSync(
      getChannelDataFilePath(channel.id),
      JSON.stringify(result, undefined, 2)
    );

    // Download files
    await downloadFilesForChannel(channel.id!);
    await downloadAvatars();
  }

  // Create HTML
  await createHtmlForChannels();

  console.log(`All done.`);
}

main();
