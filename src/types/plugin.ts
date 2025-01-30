import { Client, ChatInputCommandInteraction, SlashCommandBuilder, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

export interface Plugin {
    name: string;
    description: string;
    version: string;
    author: string;
    enabled: boolean;
    commands?: RESTPostAPIApplicationCommandsJSONBody[];
    init(client: Client): Promise<void>;
    onEnable(): Promise<void>;
    onDisable(): Promise<void>;
    executeSlashCommand(interaction: ChatInputCommandInteraction): Promise<void>;
    getSlashCommands(): RESTPostAPIApplicationCommandsJSONBody[];
}

export interface PluginConfig {
    name: string;
    enabled: boolean;
    [key: string]: any;
}

export interface PluginManager {
    plugins: Map<string, Plugin>;
    loadPlugin(pluginPath: string): Promise<void>;
    enablePlugin(pluginName: string): Promise<void>;
    disablePlugin(pluginName: string): Promise<void>;
    reloadPlugin(pluginName: string): Promise<void>;
} 