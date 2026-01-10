import type { MediaStore, Media, MediaListOptions } from "tinacms";

const DEFAULT_API_BASE = "/api/media";

export interface GitHubMediaStoreConfig {
  apiBase?: string;
}

/**
 * Custom MediaStore implementation for TinaCMS that uses our API endpoints
 * to manage media files via GitHub. The actual GitHub operations happen
 * server-side in the Azure Functions API.
 */
export class GitHubMediaStore implements MediaStore {
  accept = "*";
  private apiBase: string;

  constructor(config: GitHubMediaStoreConfig = {}) {
    this.apiBase = config.apiBase || DEFAULT_API_BASE;
  }

  async persist(files: { file: File; directory: string }[]): Promise<Media[]> {
    const uploaded: Media[] = [];

    for (const { file, directory } of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("directory", directory || "");

      const response = await fetch(this.apiBase, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      uploaded.push(result);
    }

    return uploaded;
  }

  async list(options?: MediaListOptions): Promise<{ items: Media[] }> {
    const directory = options?.directory || "";
    const url = `${this.apiBase}?directory=${encodeURIComponent(directory)}`;

    const response = await fetch(url, {
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to list media");
    }

    const items = await response.json();
    return { items };
  }

  async delete(media: Media): Promise<void> {
    const response = await fetch(this.apiBase, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filepath: media.id }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Delete failed");
    }
  }
}

/**
 * Factory function to create a GitHubMediaStore with the appropriate API base URL.
 */
export function createMediaStore(isLocalProd: boolean, localApiUrl?: string): GitHubMediaStore {
  const apiBase = isLocalProd ? `${localApiUrl}/api/media` : DEFAULT_API_BASE;
  return new GitHubMediaStore({ apiBase });
}

/**
 * Returns the GitHubMediaStore class for use with TinaCMS loadCustomStore.
 * This allows TinaCMS to instantiate the store itself.
 */
export function getMediaStoreClass(isLocalProd: boolean, localApiUrl?: string) {
  // Create a configured class that TinaCMS can instantiate
  const apiBase = isLocalProd ? `${localApiUrl}/api/media` : DEFAULT_API_BASE;

  return class ConfiguredGitHubMediaStore extends GitHubMediaStore {
    constructor() {
      super({ apiBase });
    }
  };
}
