import readline from "readline";

export function clearLastLine() {
  readline.moveCursor(process.stdout, 0, -1); // up one line
  readline.clearLine(process.stdout, 1); // from cursor to end
}
