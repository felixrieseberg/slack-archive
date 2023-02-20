import { format } from "date-fns";
import fs from "fs-extra";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server.js";
import ora, { Ora } from "ora";
import { chunk, sortBy } from "lodash-es";
import { dirname } from "path";
import { fileURLToPath } from "url";
import esMain from "es-main";
import slackMarkdown from "slack-markdown";

import { getChannels, getMessages, getUsers } from "./data-load.js";
import {
  ArchiveMessage,
  Channel,
  ChunksInfo,
  Message,
  Reaction,
  SlackArchiveData,
  User,
  Users,
} from "./interfaces.js";
import {
  getHTMLFilePath,
  INDEX_PATH,
  OUT_DIR,
  MESSAGES_JS_PATH,
  FORCE_HTML_GENERATION,
} from "./config.js";
import { slackTimestampToJavaScriptTimestamp } from "./timestamp.js";
import { recordPage } from "./search.js";
import { write } from "./data-write.js";
import { getSlackArchiveData } from "./archive-data.js";
import { getEmojiFilePath, getEmojiUnicode, isEmojiUnicode } from "./emoji.js";
import { getName } from "./users.js";
import {
  isBotChannel,
  isDmChannel,
  isPrivateChannel,
  isPublicChannel,
} from "./channels.js";

const _dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGE_CHUNK = 1000;

// This used to be a prop on the components, but passing it around
// was surprisingly slow. Global variables are cool again!
// Set by createHtmlForChannels().
let users: Users = {};
let slackArchiveData: SlackArchiveData = { channels: {} };
let me: User | null;

// Little hack to switch between ./index.html and ./html/...
let base = "";

function formatTimestamp(message: Message, dateFormat = "PPPPpppp") {
  const jsTs = slackTimestampToJavaScriptTimestamp(message.ts);
  const ts = format(jsTs, dateFormat);

  return ts;
}

interface FilesProps {
  message: Message;
  channelId: string;
}
const Files: React.FunctionComponent<FilesProps> = (props) => {
  const { message, channelId } = props;
  const { files } = message;

  if (!files || files.length === 0) return null;

  const fileElements = files.map((file) => {
    const { thumb_1024, thumb_720, thumb_480, thumb_pdf } = file as any;
    const thumb = thumb_1024 || thumb_720 || thumb_480 || thumb_pdf;
    let src = `files/${channelId}/${file.id}.${file.filetype}`;
    let href = src;

    if (file.mimetype?.startsWith("image")) {
      return (
        <a key={file.id} href={href} target="_blank">
          <img className="file" src={src} />
        </a>
      );
    }

    if (file.mimetype?.startsWith("video")) {
      return <video key={file.id} controls src={src} />;
    }

    if (file.mimetype?.startsWith("audio")) {
      return <audio key={file.id} controls src={src} />;
    }

    if (!file.mimetype?.startsWith("image") && thumb) {
      href = file.url_private || href;
      src = src.replace(`.${file.filetype}`, ".png");

      return (
        <a key={file.id} href={href} target="_blank">
          <img className="file" src={src} />
        </a>
      );
    }

    return (
      <a key={file.id} href={href} target="_blank">
        {file.name}
      </a>
    );
  });

  return <div className="files">{...fileElements}</div>;
};

interface AvatarProps {
  userId?: string;
}
const Avatar: React.FunctionComponent<AvatarProps> = ({ userId }) => {
  if (!userId) return null;

  const user = users[userId];
  if (!user || !user.profile || !user.profile.image_512) return null;

  const ext = path.extname(user?.profile?.image_512!);
  const src = `${base}avatars/${userId}${ext}`;

  return <img className="avatar" src={src} />;
};

interface ParentMessageProps {
  message: ArchiveMessage;
  channelId: string;
}
const ParentMessage: React.FunctionComponent<ParentMessageProps> = (props) => {
  const { message, channelId } = props;
  const hasFiles = !!message.files;

  return (
    <Message message={message} channelId={channelId}>
      {hasFiles ? <Files message={message} channelId={channelId} /> : null}
      {message.reactions?.map((reaction) => (
        <Reaction key={reaction.name} reaction={reaction} />
      ))}
      {message.replies?.map((reply) => (
        <ParentMessage message={reply} channelId={channelId} key={reply.ts} />
      ))}
    </Message>
  );
};

interface ReactionProps {
  reaction: Reaction;
}
const Reaction: React.FunctionComponent<ReactionProps> = ({ reaction }) => {
  const reactors = [];

  if (reaction.users) {
    for (const userId of reaction.users) {
      reactors.push(getName(userId, users));
    }
  }

  return (
    <div className="reaction" title={reactors.join(", ")}>
      <Emoji name={reaction.name!} />
      <span>{reaction.count}</span>
    </div>
  );
};

interface EmojiProps {
  name: string;
}
const Emoji: React.FunctionComponent<EmojiProps> = ({ name }) => {
  if (isEmojiUnicode(name)) {
    return <>{getEmojiUnicode(name)}</>;
  }

  return <img src={getEmojiFilePath(name)} />;
};

interface MessageProps {
  message: ArchiveMessage;
  channelId: string;
}
const Message: React.FunctionComponent<MessageProps> = (props) => {
  const { message } = props;
  const username = getName(message.user, users);
  const slackCallbacks = {
    user: ({ id }: { id: string }) => `@${getName(id, users)}`,
  };

  return (
    <div className="message-gutter" id={message.ts}>
      <div className="" data-stringify-ignore="true">
        <Avatar userId={message.user} />
      </div>
      <div className="">
        <span className="sender">{username}</span>
        <span className="timestamp">
          <span className="c-timestamp__label">{formatTimestamp(message)}</span>
        </span>
        <br />
        <div
          className="text"
          dangerouslySetInnerHTML={{
            __html: slackMarkdown.toHTML(message.text, {
              escapeHTML: false,
              slackCallbacks,
            }),
          }}
        />
        {props.children}
      </div>
    </div>
  );
};

interface MessagesPageProps {
  messages: Array<ArchiveMessage>;
  channel: Channel;
  index: number;
  chunksInfo: ChunksInfo;
}
const MessagesPage: React.FunctionComponent<MessagesPageProps> = (props) => {
  const { channel, index, chunksInfo } = props;
  const messagesJs = fs.readFileSync(MESSAGES_JS_PATH, "utf8");

  // Newest message is first
  const messages = props.messages
    .map((m) => (
      <ParentMessage key={m.ts} message={m} channelId={channel.id!} />
    ))
    .reverse();

  if (messages.length === 0) {
    messages.push(<span key="empty">No messages were ever sent!</span>);
  }

  return (
    <HtmlPage>
      <div style={{ paddingLeft: 10 }}>
        <Header index={index} chunksInfo={chunksInfo} channel={channel} />
        <div className="messages-list">{messages}</div>
        <script dangerouslySetInnerHTML={{ __html: messagesJs }} />
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
  let name = channel.name || channel.id;
  let leadSymbol = <span># </span>;

  const channelData = slackArchiveData.channels[channel.id!];
  if (channelData && channelData.messages === 0) {
    return null;
  }

  // Remove the user's name from the group mpdm channel name
  if (me && channel.is_mpim) {
    name = name?.replace(`@${me.name}`, "").replace("  ", " ");
  }

  if (channel.is_im && (channel as any).user) {
    leadSymbol = <Avatar userId={(channel as any).user} />;
  }

  if (channel.is_mpim) {
    leadSymbol = <></>;
    name = name?.replace("Group messaging with: ", "");
  }

  return (
    <li key={name}>
      <a title={name} href={`html/${channel.id!}-0.html`} target="iframe">
        {leadSymbol}
        <span>{name}</span>
      </a>
    </li>
  );
};

interface IndexPageProps {
  channels: Array<Channel>;
}
const IndexPage: React.FunctionComponent<IndexPageProps> = (props) => {
  const { channels } = props;
  const sortedChannels = sortBy(channels, "name");

  const publicChannels = sortedChannels
    .filter((channel) => isPublicChannel(channel) && !channel.is_archived)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const publicArchivedChannels = sortedChannels
    .filter((channel) => isPublicChannel(channel) && channel.is_archived)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const privateChannels = sortedChannels
    .filter((channel) => isPrivateChannel(channel) && !channel.is_archived)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const privateArchivedChannels = sortedChannels
    .filter((channel) => isPrivateChannel(channel) && channel.is_archived)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const dmChannels = sortedChannels
    .filter(
      (channel) => isDmChannel(channel, users) && !users[channel.user!].deleted
    )
    .sort((a, b) => {
      // Self first
      if (me && a.user && a.user === me.id) {
        return -1;
      }

      // Then alphabetically
      return (a.name || "Unknown").localeCompare(b.name || "Unknown");
    })
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const dmDeletedChannels = sortedChannels
    .filter(
      (channel) => isDmChannel(channel, users) && users[channel.user!].deleted
    )
    .sort((a, b) => (a.name || "Unknown").localeCompare(b.name || "Unknown"))
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const groupChannels = sortedChannels
    .filter((channel) => channel.is_mpim)
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  const botChannels = sortedChannels
    .filter((channel) => isBotChannel(channel, users))
    .sort((a, b) => {
      if (a.name && b.name) {
        return a.name!.localeCompare(b.name!);
      }

      return 1;
    })
    .map((channel) => <ChannelLink key={channel.id} channel={channel} />);

  return (
    <HtmlPage>
      <div id="index">
        <div id="channels">
          <p className="section">Public Channels</p>
          <ul>{publicChannels}</ul>
          <p className="section">Private Channels</p>
          <ul>{privateChannels}</ul>
          <p className="section">DMs</p>
          <ul>{dmChannels}</ul>
          <p className="section">Group DMs</p>
          <ul>{groupChannels}</ul>
          <p className="section">Bots</p>
          <ul>{botChannels}</ul>
          <p className="section">Archived Public Channels</p>
          <ul>{publicArchivedChannels}</ul>
          <p className="section">Archived Private Channels</p>
          <ul>{privateArchivedChannels}</ul>
          <p className="section">DMs (Deleted Users)</p>
          <ul>{dmDeletedChannels}</ul>
        </div>
        <div id="messages">
          <iframe name="iframe" src={`html/${channels[0].id!}-0.html`} />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            const urlSearchParams = new URLSearchParams(window.location.search);
            const channelValue = urlSearchParams.get("c");
            const tsValue = urlSearchParams.get("ts");
            
            if (channelValue) {
              const iframe = document.getElementsByName('iframe')[0]
              iframe.src = "html/" + decodeURIComponent(channelValue) + '.html' + '#' + (tsValue || '');
            }
            `,
          }}
        />
      </div>
    </HtmlPage>
  );
};

const HtmlPage: React.FunctionComponent = (props) => {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Slack</title>
        <link rel="stylesheet" href={`${base}style.css`} />
      </head>
      <body>{props.children}</body>
    </html>
  );
};

interface HeaderProps {
  index: number;
  chunksInfo: ChunksInfo;
  channel: Channel;
}
const Header: React.FunctionComponent<HeaderProps> = (props) => {
  const { channel, index, chunksInfo } = props;
  let created;

  if (!channel.is_im && !channel.is_mpim) {
    const creator = getName(channel.creator, users);
    const time = channel.created
      ? format(channel.created * 1000, "PPPP")
      : "Unknown";

    created =
      creator && time ? (
        <span className="created">
          Created by {creator} on {time}
        </span>
      ) : null;
  }

  return (
    <div className="header">
      <h1>{channel.name || channel.id}</h1>
      {created}
      <p className="topic">{channel.topic?.value}</p>
      <Pagination
        channelId={channel.id!}
        index={index}
        chunksInfo={chunksInfo}
      />
    </div>
  );
};

interface PaginationProps {
  index: number;
  chunksInfo: ChunksInfo;
  channelId: string;
}
const Pagination: React.FunctionComponent<PaginationProps> = (props) => {
  const { index, channelId, chunksInfo } = props;
  const length = chunksInfo.length;

  if (length === 1) {
    return null;
  }

  const older =
    index + 1 < length ? (
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
  const sep1 = older && newer ? " | " : null;
  const sep2 = older || newer ? " | " : null;

  const options: Array<JSX.Element> = [];
  for (const [i, chunk] of chunksInfo.entries()) {
    const text = `${i} - ${chunk.newest} to ${chunk.oldest}`;
    const value = `${channelId}-${i}.html`;
    const selected = i === index;
    options.push(
      <option selected={selected} key={value} value={value}>
        {text}
      </option>
    );
  }

  return (
    <div className="pagination">
      {newer}
      {sep1}
      {older}
      {sep2}
      <div className="jumper">
        <select id="jumper">{options}</select>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById("jumper").onchange = function () {
                window.location.href = this.value;
              }
            `,
          }}
        />
      </div>
    </div>
  );
};

async function renderIndexPage() {
  base = "html/";
  const channels = await getChannels();
  const page = <IndexPage channels={channels} />;

  return renderAndWrite(page, INDEX_PATH);
}

interface RenderMessagesPageOptions {
  channel: Channel;
  messages: Array<ArchiveMessage>;
  chunkIndex: number;
  chunksInfo: ChunksInfo;
}

function renderMessagesPage(options: RenderMessagesPageOptions, spinner: Ora) {
  const { channel, messages, chunkIndex: index, chunksInfo } = options;
  const page = (
    <MessagesPage
      channel={channel}
      messages={messages}
      index={index}
      chunksInfo={chunksInfo}
    />
  );

  const filePath = getHTMLFilePath(channel.id!, index);
  spinner.text = `${channel.name || channel.id}: Writing ${index + 1}/${
    chunksInfo.length
  } ${filePath}`;
  spinner.render();

  // Update the search index. In messages, the youngest message is first.
  if (messages.length > 0) {
    recordPage(channel.id, messages[messages.length - 1]?.ts);
  }

  return renderAndWrite(page, filePath);
}

async function renderAndWrite(page: JSX.Element, filePath: string) {
  const html = ReactDOMServer.renderToStaticMarkup(page);
  const htmlWDoc = "<!DOCTYPE html>" + html;

  await write(filePath, htmlWDoc);
}

export async function getChannelsToCreateFilesFor(
  channels: Array<Channel>,
  newMessages: Record<string, number>
) {
  const result: Array<Channel> = [];

  // If HTML regeneration is forced, ignore everything
  // and just return all channels
  if (FORCE_HTML_GENERATION) {
    return await getChannels();
  }

  for (const channel of channels) {
    if (channel.id) {
      // Do we have new messages?
      if (newMessages[channel.id] > 0) {
        result.push(channel);
      }

      // Did we never create a file?
      if (!fs.existsSync(getHTMLFilePath(channel.id!, 0))) {
        result.push(channel);
      }
    }
  }

  return result;
}

async function createHtmlForChannel({
  channel,
  i,
  total,
}: {
  channel: Channel;
  i: number;
  total: number;
}) {
  const messages = await getMessages(channel.id!, true);
  const chunks = chunk(messages, MESSAGE_CHUNK);
  const spinner = ora(
    `Rendering HTML for ${i + 1}/${total} ${channel.name || channel.id}`
  ).start();

  // Calculate info about all chunks
  const chunksInfo: ChunksInfo = [];
  for (const iChunk of chunks) {
    chunksInfo.push({
      oldest: formatTimestamp(iChunk[iChunk.length - 1], "Pp"),
      newest: formatTimestamp(iChunk[0], "Pp"),
      count: iChunk.length,
    });
  }

  if (chunks.length === 0) {
    await renderMessagesPage(
      {
        channel,
        messages: [],
        chunkIndex: 0,
        chunksInfo: chunksInfo,
      },
      spinner
    );
  }

  for (const [chunkI, chunk] of chunks.entries()) {
    await renderMessagesPage(
      {
        channel,
        messages: chunk,
        chunkIndex: chunkI,
        chunksInfo,
      },
      spinner
    );
  }

  spinner.succeed(
    `Rendered HTML for ${i + 1}/${total} ${channel.name || channel.id}`
  );
}

export async function createHtmlForChannels(channels: Array<Channel> = []) {
  console.log(`\n Creating HTML files for ${channels.length} channels...`);

  users = await getUsers();
  slackArchiveData = await getSlackArchiveData();
  me = slackArchiveData.auth?.user_id
    ? users[slackArchiveData.auth?.user_id]
    : null;

  for (const [i, channel] of channels.entries()) {
    if (!channel.id) {
      console.warn(`Can't create HTML for channel: No id found`, channel);
      continue;
    }

    await createHtmlForChannel({ channel, i, total: channels.length });
  }

  await renderIndexPage();

  // Copy in fonts & css
  fs.copySync(path.join(_dirname, "../static"), path.join(OUT_DIR, "html/"));
}

if (esMain(import.meta)) {
  createHtmlForChannels();
}
