import { WebClient } from "@slack/web-api";

import { config } from "./config.js";

let _webClient: WebClient;
export function getWebClient() {
  if (_webClient) return _webClient;

  const { token } = config;
  return (_webClient = new WebClient(token));
}

export async function authTest() {
  return getWebClient().auth.test();
}
