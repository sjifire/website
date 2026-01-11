const { describe, it } = require('node:test');
const assert = require('node:assert');
const createCloudinary = require('../src/_lib/cloudinary');

// Mock site configuration
const mockSiteData = {
  cloudinaryRootUrl: 'https://res.cloudinary.com/test-account',
  cloudinaryFetchUrl: 'https://example.com',
  enable_cloudinary_rewrites: false
};

describe('cloudinary module', () => {
  describe('imgPath', () => {
    describe('development mode (isProduction = false)', () => {
      const cloudinary = createCloudinary(mockSiteData, false);

      it('returns direct Cloudinary URL with default transforms', () => {
        const result = cloudinary.imgPath('/assets/media/photo.jpg');
        assert.strictEqual(
          result,
          'https://res.cloudinary.com/test-account/image/fetch/f_auto/https://example.com/assets/media/photo.jpg'
        );
      });

      it('returns direct Cloudinary URL with custom transforms', () => {
        const result = cloudinary.imgPath('/assets/media/photo.jpg', 'f_auto,q_auto:good,w_500');
        assert.strictEqual(
          result,
          'https://res.cloudinary.com/test-account/image/fetch/f_auto,q_auto:good,w_500/https://example.com/assets/media/photo.jpg'
        );
      });

      it('strips leading slashes from asset path', () => {
        const result = cloudinary.imgPath('///assets/media/photo.jpg');
        assert.strictEqual(
          result,
          'https://res.cloudinary.com/test-account/image/fetch/f_auto/https://example.com/assets/media/photo.jpg'
        );
      });

      it('handles empty asset path', () => {
        const result = cloudinary.imgPath('');
        assert.strictEqual(result, '');
      });

      it('handles null/undefined asset path', () => {
        assert.strictEqual(cloudinary.imgPath(null), '');
        assert.strictEqual(cloudinary.imgPath(undefined), '');
      });

      it('works with PDF page extraction transform', () => {
        const result = cloudinary.imgPath('/assets/media_releases/doc.pdf', 'f_auto,pg_1');
        assert.strictEqual(
          result,
          'https://res.cloudinary.com/test-account/image/fetch/f_auto,pg_1/https://example.com/assets/media_releases/doc.pdf'
        );
      });
    });

    describe('production mode without rewrites', () => {
      const siteData = { ...mockSiteData, enable_cloudinary_rewrites: false };
      const cloudinary = createCloudinary(siteData, true);

      it('returns direct Cloudinary URL (same as dev)', () => {
        const result = cloudinary.imgPath('/assets/media/photo.jpg');
        assert.strictEqual(
          result,
          'https://res.cloudinary.com/test-account/image/fetch/f_auto/https://example.com/assets/media/photo.jpg'
        );
      });
    });

    describe('production mode with rewrites enabled', () => {
      const siteData = { ...mockSiteData, enable_cloudinary_rewrites: true };
      const cloudinary = createCloudinary(siteData, true);

      it('returns /optim/ URL with transforms as query param', () => {
        const result = cloudinary.imgPath('/assets/media/photo.jpg');
        assert.strictEqual(result, '/optim/assets/media/photo.jpg?c_param=f_auto');
      });

      it('returns /optim/ URL with custom transforms', () => {
        const result = cloudinary.imgPath('/assets/media/photo.jpg', 'f_auto,w_500');
        assert.strictEqual(result, '/optim/assets/media/photo.jpg?c_param=f_auto,w_500');
      });

      it('prevents double-transformation for already processed paths', () => {
        const result = cloudinary.imgPath('/optim/assets/media/photo.jpg');
        assert.strictEqual(result, '/optim/assets/media/photo.jpg');
      });

      it('prevents double-transformation without leading slash', () => {
        const result = cloudinary.imgPath('optim/assets/media/photo.jpg');
        assert.strictEqual(result, '/optim/assets/media/photo.jpg');
      });
    });
  });

  describe('headerImageUrls', () => {
    const cloudinary = createCloudinary(mockSiteData, false);

    it('returns JSON array of image URLs', () => {
      const images = ['photo1.jpg', 'photo2.jpg'];
      const transform = '/h_520,q_auto:eco/';
      const result = cloudinary.headerImageUrls(images, transform);
      const parsed = JSON.parse(result);

      assert.strictEqual(parsed.length, 2);
      assert.strictEqual(
        parsed[0],
        'https://res.cloudinary.com/test-account/image/fetch/h_520,q_auto:eco/https://example.com/assets/media/photo1.jpg'
      );
      assert.strictEqual(
        parsed[1],
        'https://res.cloudinary.com/test-account/image/fetch/h_520,q_auto:eco/https://example.com/assets/media/photo2.jpg'
      );
    });

    it('strips leading slashes from image names', () => {
      const images = ['/photo1.jpg'];
      const result = cloudinary.headerImageUrls(images, '/h_520/');
      const parsed = JSON.parse(result);

      assert.strictEqual(
        parsed[0],
        'https://res.cloudinary.com/test-account/image/fetch/h_520/https://example.com/assets/media/photo1.jpg'
      );
    });

    it('returns empty array for null/undefined input', () => {
      assert.strictEqual(cloudinary.headerImageUrls(null, '/t/'), '[]');
      assert.strictEqual(cloudinary.headerImageUrls(undefined, '/t/'), '[]');
    });

    it('returns empty array for non-array input', () => {
      assert.strictEqual(cloudinary.headerImageUrls('not-an-array', '/t/'), '[]');
      assert.strictEqual(cloudinary.headerImageUrls({}, '/t/'), '[]');
    });

    it('handles complex transform strings with multiple segments', () => {
      const images = ['test.jpg'];
      const transform = '/h_520,q_auto:eco,b_rgb:334155/e_art:incognito/o_30/';
      const result = cloudinary.headerImageUrls(images, transform);
      const parsed = JSON.parse(result);

      assert.ok(parsed[0].includes('/h_520,q_auto:eco,b_rgb:334155/e_art:incognito/o_30/'));
    });
  });

  describe('_config exposure', () => {
    it('exposes configuration for testing/debugging', () => {
      const cloudinary = createCloudinary(mockSiteData, true);

      assert.strictEqual(cloudinary._config.cloudinaryRootUrl, mockSiteData.cloudinaryRootUrl);
      assert.strictEqual(cloudinary._config.cloudinaryFetchUrl, mockSiteData.cloudinaryFetchUrl);
      assert.strictEqual(cloudinary._config.enableRewrites, false);
      assert.strictEqual(cloudinary._config.isProduction, true);
    });
  });
});
