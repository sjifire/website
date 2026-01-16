/**
 * Cloudinary image URL utilities
 * Centralizes all Cloudinary fetch URL generation for the site
 */

const DEFAULT_TRANSFORMS = "f_auto";

/**
 * Creates Cloudinary utility functions bound to site configuration
 * @param {Object} siteData - Site configuration from site.json
 * @param {string} siteData.cloudinaryRootUrl - Cloudinary base URL (e.g., https://res.cloudinary.com/account)
 * @param {string} siteData.cloudinaryFetchUrl - Origin URL for fetch (e.g., https://sjifire.netlify.app)
 * @param {boolean} siteData.enable_cloudinary_rewrites - Whether to use /optim/ route rewrites
 * @param {boolean} isProduction - Whether running in production mode
 * @returns {Object} Object containing Cloudinary utility functions
 */
function createCloudinary(siteData, isProduction) {
  const {
    cloudinaryRootUrl,
    cloudinaryFetchUrl,
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
    return `${cloudinaryRootUrl}/image/fetch/${transforms}/${cloudinaryFetchUrl}/${cleanPath}`;
  }

  /**
   * Generate an array of Cloudinary URLs for header images
   * @param {string[]} imageSources - Array of image paths starting with /assets/media/
   * @param {string} transforms - Cloudinary transformation string
   * @returns {string} JSON string of URL array for use in JavaScript
   */
  function headerImageUrls(imageSources, transforms) {
    if (!imageSources || !Array.isArray(imageSources)) return "[]";

    const urls = imageSources
      .filter(image => image && typeof image === "string")
      .map(image => {
        const cleanPath = image.replace(/^\/+/, "");
        return `${cloudinaryRootUrl}/image/fetch${transforms}${cloudinaryFetchUrl}/${cleanPath}`;
      });

    return JSON.stringify(urls);
  }

  return {
    imgPath,
    headerImageUrls,
    // Expose for testing
    _config: { cloudinaryRootUrl, cloudinaryFetchUrl, enableRewrites, isProduction }
  };
}

module.exports = createCloudinary;
