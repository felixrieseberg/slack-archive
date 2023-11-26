import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import trash from "trash";
import { rimraf } from "rimraf";

import { AUTOMATIC_MODE, DATA_DIR, NO_BACKUP, OUT_DIR } from "./config.js";

const { prompt } = inquirer;

let backupDir = `${DATA_DIR}_backup_${Date.now()}`;

export async function createBackup() {
  if (NO_BACKUP || !fs.existsSync(DATA_DIR)) {
    return;
  }

  const hasFiles = fs.readdirSync(DATA_DIR);

  if (hasFiles.length === 0) {
    return;
  }

  console.log(`Existing data directory found. Creating backup: ${backupDir}`);

  await fs.copy(DATA_DIR, backupDir);

  console.log(`Backup created.\n`);
}

export async function deleteBackup() {
  if (!fs.existsSync(backupDir)) {
    return;
  }

  console.log(
    `Cleaning up backup: If anything went wrong, you'll find it in your system's trash.`
  );

  try {
    // NB: trash doesn't work on many Linux distros
    await trash(backupDir);
    return;
  } catch (error) {
    console.log('Moving backup to trash failed.');
  }

  if (!process.env['TRASH_HARDER']) {
    console.log(`Set TRASH_HARDER=1 to delete files permanently.`);
    return;
  }

  try {
    await rimraf(backupDir);
  } catch (error) {
    console.log(`Deleting backup permanently failed. Aborting here.`);
  }
}

export async function deleteOlderBackups() {
  try {
    const oldBackupNames: Array<string> = [];
    const oldBackupPaths: Array<string> = [];

    for (const entry of fs.readdirSync(OUT_DIR)) {
      const isBackup = entry.startsWith("data_backup_");
      if (!isBackup) continue;

      const dir = path.join(OUT_DIR, entry);
      const { isDirectory } = fs.statSync(dir);
      if (!isDirectory) continue;

      oldBackupPaths.push(dir);
      oldBackupNames.push(entry);
    }

    if (oldBackupPaths.length === 0) return;

    if (AUTOMATIC_MODE) {
      console.log(
        `Found existing older backups, but in automatic mode: Proceeding without deleting them.`
      );
      return;
    }

    const { del } = await prompt([
      {
        type: "confirm",
        default: true,
        name: "del",
        message: `We've found existing backups (${oldBackupNames.join(
          ", "
        )}). Do you want to delete them?`,
      },
    ]);

    if (del) {
      oldBackupPaths.forEach((v) => fs.removeSync(v));
    }
  } catch (error) {
    // noop
  }
}
