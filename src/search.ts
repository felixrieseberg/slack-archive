import fs from "fs-extra";
import ora, { Ora } from "ora";

import {
  NO_SEARCH,
  SEARCH_DATA_PATH,
  SEARCH_PATH,
  SEARCH_TEMPLATE_PATH,
} from "./config.js";
import { SearchFile, SearchMessage } from "./interfaces";
import { getChannels, getMessages, getUsers } from "./load-data.js";

export async function createSearch() {
  if (NO_SEARCH) return;

  const spinner = ora(`Creating search file...`).start();

  await createSearchFile(spinner);
  await createSearchHTML();

  spinner.stop();
}

async function createSearchFile(spinner: Ora) {
  const users = getUsers();
  const channels = getChannels();
  const result: SearchFile = {
    channels: {},
    users: {},
    messages: {},
  };

  for (const user in users) {
    result.users[user] = users[user].name || users[user].real_name || "Unknown";
  }

  for (const [i, channel] of channels.entries()) {
    // Little debugging hack
    // if (i > 10) continue;

    if (!channel.id) {
      console.warn(
        `Can't create search file for channel ${channel.name}: No id found`,
        channel
      );
      continue;
    }

    const name =
      channel.name || channel.id || channel.purpose?.value || "Unknown channel";
    result.channels[channel.id] = name;

    spinner.text = `Creating search file for channel ${i + 1}/${
      channels.length
    } ${name}...`;

    const messages = getMessages(channel.id).map((message) => {
      const searchMessage: SearchMessage = {
        m: message.text,
        u: message.user,
        t: message.ts,
      };

      return searchMessage;
    });

    result.messages[channel.id] = messages;
  }

  const jsContent = `window.search_data = ${JSON.stringify(result)};`;
  await fs.outputFile(SEARCH_DATA_PATH, jsContent);
}

async function createSearchHTML() {
  let template = fs.readFileSync(SEARCH_TEMPLATE_PATH, "utf8");

  template = template.replace(
    "<!-- react -->",
    getScript(`react@18.2.0/umd/react.production.min.js`)
  );
  template = template.replace(
    "<!-- react-dom -->",
    getScript(`react-dom@18.2.0/umd/react-dom.production.min.js`)
  );
  template = template.replace(
    `<!-- babel -->`,
    getScript(`babel-standalone@6.26.0/babel.min.js`)
  );
  template = template.replace(
    `<!-- minisearch -->`,
    getScript("minisearch@5.0.0/dist/umd/index.min.js")
  );

  fs.outputFileSync(SEARCH_PATH, template);
}

function getScript(script: string) {
  return `<script crossorigin src="https://cdn.jsdelivr.net/npm/${script}"></script>`;
}
