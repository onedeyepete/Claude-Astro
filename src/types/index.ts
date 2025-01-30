import { Client, Collection } from 'discord.js';

export interface BotClient extends Client {
    invites: Collection<string, Map<string, number>>;
    commands?: Collection<string, any>;
}

export interface Config {
    Version: string;
    MusicCommand: {
        CurrentTrack: TrackConfig;
        AddedTrack: TrackConfig;
        AddedTracks: TrackConfig;
        TrackFinished: TrackConfig;
        Shuffle: ShuffleConfig;
        Emojis: {
            Back: string;
            Pause: string;
            Next: string;
            Shuffle: string;
            Repeat: string;
            Platform: {
                YouTube: string;
                Spotify: string;
                SoundCloud: string;
                AppleMusic: string;
            };
        };
    };
}

interface TrackConfig {
    Enabled: boolean;
    Type: string;
    Message?: string;
    Embed?: EmbedConfig;
}

interface ShuffleConfig {
    Enabled: boolean;
    Type: string;
    Message?: string;
    Embed?: EmbedConfig;
}

interface EmbedConfig {
    Color?: string;
    Title?: string;
    Description?: string;
    Fields?: EmbedField[];
    Thumbnail?: string;
    Image?: string;
    Author?: {
        Text: string;
        Icon?: string;
    };
    Footer?: {
        Text: string;
        Icon?: string;
    };
}

interface EmbedField {
    Name: string;
    Value: string;
    Inline?: boolean;
} 