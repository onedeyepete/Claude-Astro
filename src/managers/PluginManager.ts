import { Client, REST, Routes, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { readdir, stat } from 'fs/promises';
import { join, parse, dirname } from 'path';
import { Plugin, PluginConfig } from '../types/plugin';
import { red, green, yellow, blue } from 'yoctocolors';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
// Cache interface for plugin paths
interface PluginPathCache {
    [pluginName: string]: string;
}
export class PluginManager {
    private plugins: Map<string, Plugin>;
    private client: Client;
    private pluginsDir: string;
    private rest: REST;
    private pathCache: PluginPathCache = {};
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second
    constructor(client: Client) {
        this.plugins = new Map();
        this.client = client;
        this.pluginsDir = join(process.cwd(), 'plugins');
        
        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            throw new Error('DISCORD_TOKEN environment variable is not set');
        }
        
        try {
            this.rest = new REST({ version: '10' }).setToken(token);
        } catch (error) {
            console.error(red('[PLUGINS] Failed to initialize REST API:'), error);
            throw error;
        }
    }
    // Helper function for retrying operations
    private async retry<T>(operation: () => Promise<T>, retries = this.MAX_RETRIES): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retries > 0) {
                console.log(yellow(`[PLUGINS] Retrying operation, ${retries} attempts remaining`));
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.retry(operation, retries - 1);
            }
            throw error;
        }
    }

    async loadPlugins(): Promise<void> {
        try {
            const items = await readdir(this.pluginsDir);
            const loadPromises: Promise<void>[] = [];
            
            for (const item of items) {
                const fullPath = join(this.pluginsDir, item);
                const stats = await stat(fullPath);

                if (stats.isDirectory()) {
                    try {
                        const configPath = join(fullPath, 'plugin.yml');
                        const configFile = readFileSync(configPath, 'utf8');
                        const config = load(configFile) as { name: string };
                        
                        let pluginFile: string | null = null;
                        pluginFile = await this.findPluginIndexFile(fullPath);
                        
                        if (!pluginFile) {
                            const files = await readdir(fullPath);
                            const mainFile = files.find(file => 
                                file.toLowerCase() === `${config.name.toLowerCase()}.ts` ||
                                file.toLowerCase() === `${config.name.toLowerCase()}.js`
                            );
                            if (mainFile) {
                                pluginFile = join(fullPath, mainFile);
                            }
                        }

                        if (pluginFile) {
                            // Cache the plugin path
                            this.pathCache[config.name] = pluginFile;
                            loadPromises.push(this.loadPlugin(pluginFile));
                        } else {
                            console.warn(yellow(`[PLUGINS] No plugin file found for ${config.name}`));
                        }
                    } catch (error) {
                        console.warn(yellow(`[PLUGINS] No valid plugin.yml found in ${item}`));
                    }
                } else if (this.isPluginFile(item)) {
                    loadPromises.push(this.loadPlugin(fullPath));
                }
            }
            // Load plugins in parallel
            await Promise.all(loadPromises);
            console.log(green(`[PLUGINS] Loaded ${this.plugins.size} plugins`));
        } catch (error) {
            console.error(red('[PLUGINS] Error loading plugins:'), error);
        }
    }
    private async findPluginIndexFile(dir: string): Promise<string | null> {
        const indexFiles = ['index.ts', 'index.js'];
        for (const file of indexFiles) {
            const filePath = join(dir, file);
            try {
                const stats = await stat(filePath);
                if (stats.isFile()) {
                    return filePath;
                }
            } catch {
                continue;
            }
        }
        return null;
    }
    private isPluginFile(file: string): boolean {
        return file.endsWith('.ts') || file.endsWith('.js');
    }
    private async loadPlugin(pluginPath: string): Promise<void> {
        return this.retry(async () => {
            try {
                const modulePath = pluginPath.replace(/\\/g, '/');
                let pluginEnabled = true;
                let pluginVersion: string | undefined;
                const configPath = pluginPath.endsWith('index.ts') || pluginPath.endsWith('index.js')
                    ? join(dirname(pluginPath), 'plugin.yml')
                    : join(dirname(pluginPath), 'plugin.yml');

                try {
                    const configFile = readFileSync(configPath, 'utf8');
                    const config = load(configFile) as { enabled?: boolean; version?: string };
                    pluginEnabled = config.enabled ?? true;
                    pluginVersion = config.version;
                } catch (error) {
                    console.log(yellow(`[PLUGINS] No config found for ${pluginPath}, defaulting to enabled`));
                }

                const PluginClass = (await import(modulePath)).default;
                const plugin: Plugin = new PluginClass();

                if (!plugin.name) {
                    throw new Error(`Plugin at ${pluginPath} is missing required 'name' property`);
                }
                
                if (pluginVersion) {
                    plugin.version = pluginVersion;
                }

                await plugin.init(this.client);
                this.plugins.set(plugin.name, plugin);
                this.pathCache[plugin.name] = pluginPath;

                console.log(green(`[PLUGINS] Loaded plugin: ${plugin.name}`));

                if (pluginEnabled && process.env.PLUGINS_ENABLED !== 'false') {
                    await this.enablePlugin(plugin.name);
                }
            } catch (error) {
                console.error(red(`[PLUGINS] Error loading plugin ${pluginPath}:`), error);
                throw error;
            }
        });
    }
    private async registerPluginCommands(plugin: Plugin): Promise<void> {
        if (!plugin.getSlashCommands?.()) return;
        return this.retry(async () => {
            try {
                const commands = plugin.getSlashCommands?.();
                if (!commands || commands.length === 0) return;
                plugin.commands = commands;
                
                if (!this.client.isReady() || !this.client.application?.id) {
                    throw new Error('Client is not ready or application ID not found');
                }

                console.log(blue(`[PLUGINS] Registering ${commands.length} commands for ${plugin.name}`));

                // Fetch existing commands
                const existingCommands = await this.rest.get(
                    Routes.applicationCommands(this.client.application.id)
                ) as RESTPostAPIApplicationCommandsJSONBody[];

                // Process new commands
                const newCommands = commands.map(cmd => {
                    const commandData = cmd.data || cmd;
                    return {
                        name: commandData.name.toLowerCase(),
                        description: commandData.description || 'No description provided',
                        type: 1,
                        options: this.processCommandOptions(commandData.options),
                        default_member_permissions: commandData.default_member_permissions?.toString(),
                        dm_permission: commandData.dm_permission ?? false
                    };
                });

                // Merge existing and new commands, avoiding duplicates
                const mergedCommands = [...existingCommands];
                for (const newCmd of newCommands) {
                    const existingIndex = mergedCommands.findIndex(cmd => cmd.name === newCmd.name);
                    if (existingIndex !== -1) {
                        mergedCommands[existingIndex] = newCmd;
                    } else {
                        mergedCommands.push(newCmd);
                    }
                }

                // Register all commands
                await this.rest.put(
                    Routes.applicationCommands(this.client.application.id),
                    { 
                        body: mergedCommands,
                        headers: {
                            Authorization: `Bot ${process.env.DISCORD_TOKEN}`
                        }
                    }
                );

                console.log(green(`[PLUGINS] Successfully registered commands for ${plugin.name}`));
                this.setupInteractionHandler();
            } catch (error) {
                console.error(red(`[PLUGINS] Failed to register commands: ${error.message}`));
                throw error;
            }
        });
    }
    private processCommandOptions(options: any[] = []): any[] {
        return options.map(opt => ({
            name: opt.name,
            description: opt.description || 'No description provided',
            type: Number(opt.type || 3),
            required: opt.required ?? false,
            choices: opt.choices,
            options: opt.options ? this.processCommandOptions(opt.options) : undefined
        }));
    }
    private setupInteractionHandler(): void {
        if (this.client.listeners('interactionCreate').length) return;
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            for (const [, plugin] of this.plugins) {
                if (!plugin.enabled || !plugin.commands) continue;
                
                const commandNames = plugin.commands.map(cmd => 
                    (cmd.data || cmd).name.toLowerCase()
                );
                
                if (commandNames.includes(interaction.commandName)) {
                    try {
                        await plugin.executeSlashCommand(interaction);
                    } catch (error) {
                        console.error(red(`[PLUGINS] Error executing command ${interaction.commandName}:`), error);
                        await interaction.reply({ 
                            content: 'There was an error executing this command!', 
                            ephemeral: true 
                        }).catch(() => {});
                    }
                    break;
                }
            }
        });
    }
    async enablePlugin(pluginName: string): Promise<void> {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }
        plugin.enabled = true;
        await this.registerPluginCommands(plugin);
        console.log(green(`[PLUGINS] Enabled plugin: ${pluginName}`));
    }
    async disablePlugin(pluginName: string): Promise<void> {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            throw new Error(`Plugin ${pluginName} not found`);
        }
        plugin.enabled = false;
        await this.unregisterPluginCommands(plugin);
        console.log(yellow(`[PLUGINS] Disabled plugin: ${pluginName}`));
    }
    private async unregisterPluginCommands(plugin: Plugin): Promise<void> {
        if (!plugin.getSlashCommands?.()) return;
        return this.retry(async () => {
            try {
                const commands = plugin.getSlashCommands?.();
                if (!commands || commands.length === 0) return;
                console.log(blue(`[PLUGINS] Unregistering commands for ${plugin.name}`));
                const commandNames = commands.map(cmd => (cmd.data || cmd).name.toLowerCase());
                await this.rest.put(
                    Routes.applicationCommands(this.client.application.id),
                    { 
                        body: commandNames.map(name => ({ name })),
                        headers: {
                            Authorization: `Bot ${process.env.DISCORD_TOKEN}`
                        }
                    }
                );
                console.log(green(`[PLUGINS] Successfully unregistered commands for ${plugin.name}`));
            } catch (error) {
                console.error(red(`[PLUGINS] Failed to unregister commands: ${error.message}`));
                throw error;
            }
        });
    }
    async reloadPlugin(pluginName: string): Promise<void> {
        return this.retry(async () => {
            const plugin = this.plugins.get(pluginName);
            if (!plugin) {
                throw new Error(`Plugin ${pluginName} not found`);
            }
            try {
                await this.disablePlugin(pluginName);
                this.plugins.delete(pluginName);
                const cachedPath = this.pathCache[pluginName];
                if (cachedPath) {
                    await this.loadPlugin(cachedPath);
                } else {
                    const pluginPath = await this.findPluginPath(pluginName);
                    if (pluginPath) {
                        await this.loadPlugin(pluginPath);
                    } else {
                        throw new Error(`Could not find plugin file for ${pluginName}`);
                    }
                }
            } catch (error) {
                console.error(red(`[PLUGINS] Error reloading plugin ${pluginName}:`), error);
                throw error;
            }
        });
    }
    private async findPluginPath(pluginName: string): Promise<string | null> {
        const items = await readdir(this.pluginsDir);
        for (const item of items) {
            const fullPath = join(this.pluginsDir, item);
            const stats = await stat(fullPath);
            if (stats.isDirectory()) {
                const pluginFile = await this.findPluginIndexFile(fullPath);
                if (pluginFile) {
                    const configPath = join(fullPath, 'plugin.yml');
                    const configFile = readFileSync(configPath, 'utf8');
                    const config = load(configFile) as { name: string };
                    if (config.name === pluginName) {
                        return pluginFile;
                    }
                }
            } else if (this.isPluginFile(item) && item.startsWith(pluginName)) {
                return fullPath;
            }
        }
        return null;
    }
    getPlugin(pluginName: string): Plugin | undefined {
        return this.plugins.get(pluginName);
    }
    getAllPlugins(): Plugin[] {
        return Array.from(this.plugins.values());
    }
}