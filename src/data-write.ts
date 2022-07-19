import fs from "fs-extra";
import { uniqBy } from "lodash-es";
import { SLACK_ARCHIVE_DATA_PATH } from "./config.js";
import { SlackArchiveData } from "./interfaces.js";

import { retry } from "./retry.js";

export async function write(filePath: string, data: any) {
  await retry({ name: `Writing ${filePath}` }, () => {
    fs.outputFileSync(filePath, data);
  });
}

export async function writeAndMerge(filePath: string, newData: any) {
  await retry({ name: `Writing ${filePath}` }, () => {
    let dataToWrite = newData;

    if (fs.existsSync(filePath)) {
      const oldData = fs.readJSONSync(filePath);

      if (Array.isArray(oldData)) {
        dataToWrite = [...oldData, ...newData];

        if (newData && newData[0] && newData[0].id) {
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
  });
}
