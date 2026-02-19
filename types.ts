export interface PropertyDetails {
  street: string;
  city: string;
  state: string;
  zip: string;
  mlsNumber: string;
}

export interface VideoSearchResult {
  title: string;
  uri: string;
  source: string;
  thumbnailUrl?: string; // Optional if we can't extract it
}

export interface SearchResponse {
  summary: string;
  videos: VideoSearchResult[];
  found: boolean;
}

export interface ImageFile {
  file: File;
  preview: string;
  base64: string;
  mimeType: string;
}
