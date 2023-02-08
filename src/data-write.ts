import fs from "fs-extra";
import { differenceBy } from "lodash-es";

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
        if (newData && newData[0] && newData[0].id) {
          // Take the old data, exclude aything that is in the new data,
          // and then add the new data
          dataToWrite = [
            ...differenceBy(oldData, newData, (v: any) => v.id),
            ...newData,
          ];
        } else {
          dataToWrite = [...oldData, ...newData];
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
