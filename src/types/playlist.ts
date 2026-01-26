export type PlaylistTrackStatus = "current" | "upcoming" | "played";

export interface PlaylistTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  formatLabel?: string;
  sampleRate?: number;
  bitDepth?: number;
  status: PlaylistTrackStatus;
  file?: File;
}
