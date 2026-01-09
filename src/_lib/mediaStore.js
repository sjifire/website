const isLocalProd = process.env.TINA_PUBLIC_LOCAL_PROD === "true";
const apiBase = isLocalProd ? "http://localhost:7071/api/media" : "/api/media";

class GitHubMediaStore {
  constructor() {
    this.accept = "image/*,application/pdf";
  }

  async persist(files) {
    const uploaded = [];

    for (const { file, directory } of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("directory", directory || "");

      const response = await fetch(apiBase, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      uploaded.push({
        type: "file",
        id: result.id,
        filename: result.filename,
        directory: result.directory,
        src: result.src,
      });
    }

    return uploaded;
  }

  async list(options) {
    const directory = options?.directory || "";
    const url = `${apiBase}?directory=${encodeURIComponent(directory)}`;

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

  async delete(media) {
    const response = await fetch(apiBase, {
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

module.exports = { GitHubMediaStore };
