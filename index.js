import http from "node:http";
import { Client, GatewayIntentBits, Events, ChannelType } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

const TOKEN = process.env.DISCORD_TOKEN || "MTU2NTc5NDMyMzY0NjM4MjEwMA.Gy97n3.zfEpU-zVZyheEvxFIQp1JePRXkJWqfPaz31poc";
const GUILD_ID = process.env.GUILD_ID || "1546186838983573656";
const CHANNEL_ID = process.env.CHANNEL_ID || "1546401580247556106";

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN. Add it to the environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let reconnecting = false;

async function connectToChannel() {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.error("Server not found. Check GUILD_ID, and make sure the bot was invited.");
    return;
  }

  const channel = await guild.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    console.error("Voice channel not found. Check CHANNEL_ID.");
    return;
  }

  const previous = getVoiceConnection(guild.id);
  if (previous) previous.destroy();

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log("Holding voice channel: " + channel.name);
  });

  // Discord drops the voice socket sometimes. Try to recover, otherwise rejoin.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      connection.destroy();
      scheduleReconnect();
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  setTimeout(() => {
    reconnecting = false;
    if (client.isReady()) connectToChannel();
  }, 5000);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log("Logged in as " + readyClient.user.tag);
  connectToChannel();
});

// If someone moves or kicks the bot out of the channel, walk back in.
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (newState.id !== client.user.id) return;
  if (oldState.channelId && !newState.channelId) {
    console.log("Removed from voice. Rejoining...");
    scheduleReconnect();
  }
});

process.on("unhandledRejection", (error) => {
  console.error("Unexpected error:", error);
});

// A tiny web page so free hosting plans see the service as alive.
const port = process.env.PORT || 3000;
http
  .createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("Voice keeper is online.");
  })
  .listen(port, () => console.log("Keep-alive server on port " + port));

client.login(TOKEN);
