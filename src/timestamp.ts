export function slackTimestampToJavaScriptTimestamp(ts?: string) {
  if (!ts) {
    return 0;
  }

  const splitTs = ts.split(".") || [];
  const jsTs = parseInt(`${splitTs[0]}${splitTs[1].slice(0, 3)}`, 10);

  return jsTs;
}
