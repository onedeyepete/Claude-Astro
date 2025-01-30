import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { green, red, blue } from 'yoctocolors';
import { PluginManager } from './managers/PluginManager';
import dotenv from 'dotenv';

// Load environment variables
config();

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('Missing required DISCORD_TOKEN environment variable');
    process.exit(1);
}

// Initialize client with intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent
    ]
});

// Add invites property to client
declare module 'discord.js' {
    interface Client {
        invites: Collection<string, Map<string, number>>;
    }
}

client.invites = new Collection();

// Version and Node version check
try {
    const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
    const botVersion = process.env.BOT_VERSION || '1.0.0';

    if (packageJson.version !== botVersion) {
        console.log(red(`[ERROR] Version mismatch: package.json version (${packageJson.version}) does not match BOT_VERSION (${botVersion}). Please update the bot...`));
        process.exit(1);
    }

    const nodeVersion = Number(process.version.split('.')[0].replace('v', ''));
    if (nodeVersion < 18) {
        console.log(red(`[ERROR] Bot requires NodeJS version 18 or higher!`));
        console.log(blue(`\n[INFO] To update Node.js, follow the instructions below:`));
        console.log(green(`- Windows: Download from ${green('https://nodejs.org/')}`));
        console.log(green(`- Ubuntu/Debian:`));
        console.log(green(`  sudo apt update && sudo apt upgrade nodejs`));
        console.log(green(`- CentOS:`));
        console.log(green(`  sudo yum update && sudo yum install -y nodejs`));
        process.exit(1);
    }
} catch (error) {
    console.error('Error checking versions:', error);
    process.exit(1);
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize plugin manager
const pluginManager = new PluginManager(client);

// Client ready event
client.once('ready', async () => {
    console.log(green(`[READY] Logged in as ${client.user?.tag}`));
    
    // Load plugins
    await pluginManager.loadPlugins();
    
    // Initialize invite tracking
    client.guilds.cache.forEach(async guild => {
        try {
            const invites = await guild.invites.fetch();
            const codeUses = new Map(invites.map(invite => [invite.code, invite.uses ?? 0]));
            client.invites.set(guild.id, codeUses);
        } catch (error) {
            console.error(`Failed to fetch invites for guild ${guild.id}:`, error);
        }
    });
});

// Login
client.login(process.env.DISCORD_TOKEN); 