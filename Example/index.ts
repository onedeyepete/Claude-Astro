import { Plugin } from '../../src/types/plugin';
import { Client, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export default class ExamplePlugin implements Plugin {
    name = 'Example';
    description = 'An example plugin';
    version = '1.0.0';
    author = 'Your Name';
    enabled = false;
    commands: any[] = [];

    async init(client: Client): Promise<void> {}

    getSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('hello')
                .setDescription('Says hello')
                .toJSON()
        ];
        
        console.log('[EXAMPLE] Registering commands:', commands);
        return commands;
    }

    async executeSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.commandName === 'hello') {
            await interaction.reply('Hello there!');
        }
    }

    async onEnable(): Promise<void> {
        console.log('Example plugin enabled!');
        console.log('You can delete this if you want');
    }

    async onDisable(): Promise<void> {
        console.log('Example plugin disabled!');
    }
} 