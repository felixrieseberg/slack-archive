import fs from "fs-extra";

import { SLACK_ARCHIVE_DATA_PATH } from "./config.js";
import { readJSON } from "./data-load.js";
import { write } from "./data-write.js";
import { SlackArchiveData, User } from "./interfaces.js";

export async function getSlackArchiveData(): Promise<SlackArchiveData> {
  const returnIfEmpty: SlackArchiveData = { channels: {} };

  if (!fs.existsSync(SLACK_ARCHIVE_DATA_PATH)) {
    return returnIfEmpty;
  }

  const result = await readJSON<SlackArchiveData>(SLACK_ARCHIVE_DATA_PATH);
  const merged = { channels: result.channels || {}, auth: result.auth };

  return merged;
}

export async function setSlackArchiveData(
  newData: SlackArchiveData
): Promise<void> {
  const oldData = await getSlackArchiveData();
  const dataToWrite = {
    channels: { ...oldData.channels, ...newData.channels },
    auth: newData.auth,
  };

  return write(
    SLACK_ARCHIVE_DATA_PATH,
    JSON.stringify(dataToWrite, undefined, 2)
  );
}
