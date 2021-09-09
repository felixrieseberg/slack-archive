import { format } from "date-fns";
import fs from "fs";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server";

import { getChannels, getMessages, getUsers } from "./load-data";
import { Channel, Message, Users } from "./interfaces";
import { chunk } from "lodash";
import {
  getChannelDataFilePath,
  getChannelUploadFilePath,
  getHTMLFilePath,
  INDEX_PATH,
  OUT_DIR,
} from "./config";
import { clearLastLine } from "./log-line";

const { toHTML } = require("slack-markdown");
const users = getUsers();

interface TimestampProps {
  message: Message;
}
const Timestamp: React.FunctionComponent<TimestampProps> = (props) => {
  const jsTs = parseInt(`${props.message.ts?.split(".")[0]}000`, 10);
  const ts = format(jsTs, "PPPPpppp");

  return <span className="c-timestamp__label">{ts}</span>;
};

interface FilesProps {
  message: Message;
  channelId: string;
}
const Files: React.FunctionComponent<FilesProps> = (props) => {
  const { message, channelId } = props;
  const { files } = message;

  if (!files || files.length === 0) return null;

  const fileElements = files.map((file) => {
    const src = `files/${channelId}/${file.id}.${file.filetype}`;

    return (
      <a key={file.id} href={src}>
        <img className="file" src={src} />
      </a>
    );
  });

  return <div className="files">{...fileElements}</div>;
};

interface MessageProps {
  message: Message;
  channelId: string;
}
const Message: React.FunctionComponent<MessageProps> = (props) => {
  const { message, channelId } = props;
  const username = message.user
    ? users[message.user]?.name
    : message.user || "Unknown";

  const avatar = message.user ? (
    <img className="avatar" src={`avatars/${message.user}.png`} width="72" />
  ) : null;

  return (
    <div className="message-gutter">
      <div className="" data-stringify-ignore="true">
        {avatar}
      </div>
      <div className="">
        <span className="sender">{username}</span>
        <span className="timestamp">
          <Timestamp message={message} />
        </span>
        <br />
        <div
          className="text"
          dangerouslySetInnerHTML={{ __html: toHTML(message.text) }}
        />
        <Files message={message} channelId={channelId} />
      </div>
    </div>
  );
};

interface MessagesPageProps {
  messages: Array<Message>;
  channel: Channel;
  index: number;
  total: number;
}
const MessagesPage: React.FunctionComponent<MessagesPageProps> = (props) => {
  const { channel, index, total } = props;
  const messages = props.messages
    .map((m) => <Message key={m.ts} message={m} channelId={channel.id!} />)
    .reverse();

  return (
    <HtmlPage>
      <div style={{ paddingLeft: 10 }}>
        <Header index={index} total={total} channel={channel} />
        <div className="messages-list">{messages}</div>
        <script
          dangerouslySetInnerHTML={{ __html: "scrollBy({ top: 99999999 })" }}
        />
      </div>
    </HtmlPage>
  );
};

interface ChannelLinkProps {
  channel: Channel;
}
const ChannelLink: React.FunctionComponent<ChannelLinkProps> = ({
  channel,
}) => {
  const name = channel.name || channel.id;

  return (
    <li key={name}>
      {/* Todo: Target iframe */}
      <a href={`html/${channel.id!}-0.html`} target="iframe">
        # {name}
      </a>
    </li>
  );
};

interface IndexPageProps {
  channels: Array<Channel>;
}
const IndexPage: React.FunctionComponent<IndexPageProps> = (props) => {
  const { channels } = props;

  const publicChannels = channels
    .filter(
      (channel) => !channel.is_private && !channel.is_mpim && !channel.is_im
    )
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const privateChannels = channels
    .filter((channel) => channel.is_private)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const dmChannels = channels
    .filter((channel) => channel.is_mpim || channel.is_im)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  return (
    <HtmlPage>
      <div id="index">
        <div id="channels">
          <p>Public Channels</p>
          <ul>{publicChannels}</ul>
          <p>Private Channels</p>
          <ul>{privateChannels}</ul>
          <p>DMs</p>
          <ul>{dmChannels}</ul>
        </div>
        <div id="messages">
          <iframe name="iframe" src={`html/${channels[0].id!}-0.html`} />
        </div>
      </div>
    </HtmlPage>
  );
};

const HtmlPage: React.FunctionComponent = (props) => {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Slack</title>
        <link rel="stylesheet" href="html/style.css" />
        <link rel="stylesheet" href="style.css" />
      </head>
      <body>{props.children}</body>
    </html>
  );
};

interface HeaderProps {
  index: number;
  total: number;
  channel: Channel;
}
const Header: React.FunctionComponent<HeaderProps> = (props) => {
  const { channel, index, total } = props;
  const creator = channel.creator
    ? users[channel.creator]?.name || channel.creator
    : "Unknown";
  const created = channel.created
    ? format(channel.created * 1000, "PPPPpppp")
    : "Unknown";

  return (
    <div className="header">
      <h1>{channel.name || channel.id}</h1>
      <span className="created">
        Created by {creator} on {created}
      </span>
      <p className="topic">{channel.topic?.value}</p>
      <Pagination channelId={channel.id!} index={index} total={total} />
    </div>
  );
};

interface PaginationProps {
  index: number;
  total: number;
  channelId: string;
}
const Pagination: React.FunctionComponent<PaginationProps> = (props) => {
  const { index, total, channelId } = props;

  if (total === 1) {
    return null;
  }

  const older =
    index + 1 < total ? (
      <span>
        <a href={`${channelId}-${index + 1}.html`}>Older Messages</a>
      </span>
    ) : null;
  const newer =
    index > 0 ? (
      <span>
        <a href={`${channelId}-${index - 1}.html`}>Newer Messages </a>
      </span>
    ) : null;
  const sep = older && newer ? " | " : null;

  let jump = [];

  for (let ji = 0; ji < total; ji++) {
    jump.push(
      <a key={ji} href={`${channelId}-${ji}.html`}>
        {ji}
      </a>
    );
  }

  return (
    <div className="pagination">
      {newer}
      {sep}
      {older}
      <br />
      <div className="jumper">{jump}</div>
    </div>
  );
};

function renderIndexPage(channels: Array<Channel>) {
  const page = <IndexPage channels={channels} />;

  return renderAndWrite(page, INDEX_PATH);
}

function renderMessagesPage(
  channel: Channel,
  messages: Array<Message>,
  index: number,
  total: number
) {
  const page = (
    <MessagesPage
      channel={channel}
      messages={messages}
      index={index}
      total={total}
    />
  );

  const filePath = getHTMLFilePath(channel.id!, index);

  return renderAndWrite(page, filePath);
}

function renderAndWrite(page: JSX.Element, filePath: string) {
  const html = ReactDOMServer.renderToStaticMarkup(page);
  const htmlWDoc = "<!DOCTYPE html>" + html;

  fs.writeFileSync(filePath, htmlWDoc);

  clearLastLine();
  console.log(`Wrote ${filePath}`);
}

export function createHtmlForChannel(channel: Channel) {
  const messages = getMessages(channel.id!);
  const chunks = chunk(messages, 1000);

  chunks.forEach((chunk, i) => {
    renderMessagesPage(channel, chunk, i, chunks.length);
  });
}

export function createHtmlForChannels(
  channels: Array<Channel> = getChannels()
) {
  console.log(`Creating HTML files...`);

  for (const channel of channels) {
    if (!channel.id) {
      console.warn(`Can't create HTML for channel: No id found`, channel);
      continue;
    }

    createHtmlForChannel(channel);
  }

  renderIndexPage(channels);

  // Copy in CSS
  fs.copyFileSync(
    path.join(__dirname, "../static/style.css"),
    path.join(OUT_DIR, "html/style.css")
  );
}

if (require.main?.filename === __filename) {
  createHtmlForChannels();
}
