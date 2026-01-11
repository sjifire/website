/**
 * Cloudinary image URL utilities
 * Centralizes all Cloudinary fetch URL generation for the site
 */

const DEFAULT_TRANSFORMS = "f_auto";

/**
 * Creates Cloudinary utility functions bound to site configuration
 * @param {Object} siteData - Site configuration from site.json
 * @param {string} siteData.cloudinaryRootUrl - Cloudinary base URL (e.g., https://res.cloudinary.com/account)
 * @param {string} siteData.cloudinarySiteId - Origin URL for fetch (e.g., https://sjifire.netlify.app)
 * @param {boolean} siteData.enable_cloudinary_rewrites - Whether to use /optim/ route rewrites
 * @param {boolean} isProduction - Whether running in production mode
 * @returns {Object} Object containing Cloudinary utility functions
 */
function createCloudinary(siteData, isProduction) {
  const {
    cloudinaryRootUrl,
    cloudinarySiteId,
    enable_cloudinary_rewrites: enableRewrites
  } = siteData;

  /**
   * Generate a Cloudinary image URL for a given asset path
   * @param {string} assetPath - Path to the asset (e.g., '/assets/media/photo.jpg')
   * @param {string} [transforms='f_auto'] - Cloudinary transformation string
   * @returns {string} Full URL to the optimized image
   */
  function imgPath(assetPath, transforms = DEFAULT_TRANSFORMS) {
    if (!assetPath) return "";

    // Strip leading slashes - Cloudinary has issues with double slashes
    const cleanPath = assetPath.replace(/^\/+/, "");

    // Production with rewrites enabled: use /optim/ route
    if (isProduction && enableRewrites) {
      // Prevent double-transformation if already processed
      if (/^(\/)?optim\//.test(cleanPath)) {
        return `/${cleanPath}`;
      }
      return `/optim/${cleanPath}?c_param=${transforms}`;
    }

    // Default: direct Cloudinary fetch URL
    return `${cloudinaryRootUrl}/image/fetch/${transforms}/${cloudinarySiteId}/${cleanPath}`;
  }

  /**
   * Generate an array of Cloudinary URLs for header images
   * Used for the homepage header carousel
   * @param {string[]} imageSources - Array of image filenames
   * @param {string} transforms - Cloudinary transformation string (can include path segments)
   * @returns {string} JSON string of URL array for use in JavaScript
   */
  function headerImageUrls(imageSources, transforms) {
    if (!imageSources || !Array.isArray(imageSources)) return "[]";

    const urls = imageSources.map(image => {
      const cleanImage = image.replace(/^\/+/, "");
      // Header images use a special transform format with path segments
      // e.g., /h_520,q_auto:eco/e_art:incognito/...
      return `${cloudinaryRootUrl}/image/fetch${transforms}${cloudinarySiteId}/assets/media/${cleanImage}`;
    });

    return JSON.stringify(urls);
  }

  return {
    imgPath,
    headerImageUrls,
    // Expose for testing
    _config: { cloudinaryRootUrl, cloudinarySiteId, enableRewrites, isProduction }
  };
}

module.exports = createCloudinary;
