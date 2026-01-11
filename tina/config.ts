// Load .env on server-side only (not in browser)
if (typeof window === "undefined") {
  require("dotenv/config");
}
import { defineConfig } from "tinacms";
import { createAuthProvider } from "./auth-provider";
import { getMediaStoreClass } from "./media-store";

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";
const isLocalProd = process.env.TINA_PUBLIC_LOCAL_PROD === "true";
const LOCAL_AZURE_FUNCTIONS_URL = "http://localhost:7071";

// API URL: undefined for local, localhost:7071 for local-prod testing, relative for production
const getApiUrl = () => {
  if (isLocal) {
    return undefined;
  } else if (isLocalProd) {
    return `${LOCAL_AZURE_FUNCTIONS_URL}/api/tina/gql`;
  } else {
    return "/api/tina/gql";
  }
};

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || process.env.TINA_BRANCH || "main",

  // Self-hosted: use custom backend in production, local mode for development
  contentApiUrlOverride: getApiUrl(),
  // Use local auth for both local and local-prod modes (Azure AD only in real production)
  authProvider: createAuthProvider(isLocal || isLocalProd),

  build: {
    outputFolder: "admin",
    publicFolder: "_site",
  },

  // Media config: local filesystem for dev, custom GitHub store for production
  media: isLocal
    ? {
        tina: {
          mediaRoot: "assets/media",
          publicFolder: "src",
        },
      }
    : {
        loadCustomStore: async () => getMediaStoreClass(isLocalProd, LOCAL_AZURE_FUNCTIONS_URL),
      },

  schema: {
    collections: [
      {
        name: "configBurnStatus",
        label: "Config: Burn Status",
        path: "src/_data",
        format: "json",
        match: {
          include: "burn_status",
        },
        ui: {
          allowedActions: {
            create: false,
            delete: false,
          },
        },
        fields: [
          {
            type: "string",
            name: "fire_status",
            label: "Fire Danger Level",
            options: ["Low", "Moderate", "High", "Very High", "Extreme"],
            required: true,
          },
          {
            type: "datetime",
            name: "burn_season_start",
            label: "Burn Season Start",
          },
          {
            type: "datetime",
            name: "burn_season_end",
            label: "Burn Season End",
          },
          {
            type: "string",
            name: "burn_ban_status",
            label: "Residential Burn Permits Status",
            options: ["Open", "Closed"],
            required: true,
          },
          {
            type: "string",
            name: "commercial_burn_ban_status",
            label: "Commercial Burn Permits Status",
            options: ["Open", "Closed"],
            required: true,
          },
          {
            type: "string",
            name: "rec_campfire_status",
            label: "Recreational Fires (San Juan County)",
            options: ["Open", "Restricted", "Closed"],
            required: true,
          },
          {
            type: "string",
            name: "state_campfire_status",
            label: "Recreational Fires (State Park & DNR)",
            options: ["Open", "Restricted", "Closed"],
            required: true,
          },
          {
            type: "string",
            name: "np_campfire_status",
            label: "Recreational Fires (National Parks)",
            options: ["Open", "Restricted", "Closed"],
            required: true,
          },
        ],
      },
      {
        name: "configNavigation",
        label: "Config: Navigation",
        path: "src/_data",
        format: "json",
        match: {
          include: "navigation",
        },
        ui: {
          allowedActions: {
            create: false,
            delete: false,
          },
        },
        fields: [
          {
            type: "string",
            name: "header_highlight_url",
            label: "Header Highlight URL",
            description: "URL of page to highlight in navigation (e.g., /about/join/). Label is pulled from page title.",
          },
          {
            type: "object",
            name: "items",
            label: "Menu Items",
            list: true,
            ui: {
              itemProps: (item) => ({
                label: item?.label || "New Item",
              }),
            },
            fields: [
              {
                type: "string",
                name: "label",
                label: "Label",
                required: true,
              },
              {
                type: "string",
                name: "folder",
                label: "Auto-populate from folder",
                description: "Folder name (e.g., 'about', 'services') to auto-populate children from pages",
              },
              {
                type: "string",
                name: "url",
                label: "URL",
                description: "Direct link URL (for items without dropdown)",
              },
              {
                type: "object",
                name: "children",
                label: "Static Children",
                description: "Manual child links (used when folder is not set)",
                list: true,
                ui: {
                  itemProps: (item) => ({
                    label: item?.label || "New Link",
                  }),
                },
                fields: [
                  {
                    type: "string",
                    name: "label",
                    label: "Label",
                    required: true,
                  },
                  {
                    type: "string",
                    name: "url",
                    label: "URL",
                    required: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "configSite",
        label: "Config: Site",
        path: "src/_data",
        format: "json",
        match: {
          include: "site",
        },
        ui: {
          allowedActions: {
            create: false,
            delete: false,
          },
        },
        fields: [
          {
            type: "string",
            name: "site_name",
            label: "Site Name",
            required: true,
          },
          {
            type: "string",
            name: "formal_site_name",
            label: "Formal Site Name",
          },
          {
            type: "string",
            name: "site_desc",
            label: "Site Description",
            ui: {
              component: "textarea",
            },
          },
          {
            type: "string",
            name: "prodUrl",
            label: "Production URL",
          },
          {
            type: "string",
            name: "cloudinaryFetchUrl",
            label: "Cloudinary Site ID",
          },
          {
            type: "string",
            name: "cloudinaryRootUrl",
            label: "Cloudinary Root URL",
          },
          {
            type: "boolean",
            name: "enable_cloudinary_rewrites",
            label: "Enable Cloudinary Rewrites",
          },
          {
            type: "string",
            name: "opengraph_image",
            label: "OpenGraph Image Filename",
          },
          {
            type: "object",
            name: "address",
            label: "Address",
            fields: [
              {
                type: "string",
                name: "street",
                label: "Street",
              },
              {
                type: "string",
                name: "city",
                label: "City",
              },
              {
                type: "string",
                name: "state",
                label: "State",
              },
              {
                type: "string",
                name: "zip",
                label: "ZIP Code",
              },
              {
                type: "string",
                name: "phone",
                label: "Phone",
              },
              {
                type: "string",
                name: "map",
                label: "Google Maps Embed URL",
                ui: {
                  component: "textarea",
                },
              },
            ],
          },
        ],
      },
      {
        name: "configPersonnel",
        label: "Config: Personnel",
        path: "src/pages/about",
        format: "mdx",
        match: {
          include: "emergency-personnel-data",
        },
        ui: {
          allowedActions: {
            create: false,
            delete: false,
          },
        },
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "object",
            name: "personnel",
            label: "Personnel",
            list: true,
            ui: {
              itemProps: (item) => ({
                label: item?.first_name && item?.last_name
                  ? `${item.first_name} ${item.last_name}`
                  : "New Person",
              }),
            },
            fields: [
              {
                type: "string",
                name: "first_name",
                label: "First Name",
                required: true,
              },
              {
                type: "string",
                name: "last_name",
                label: "Last Name",
                required: true,
              },
              {
                type: "string",
                name: "title",
                label: "Title",
              },
              {
                type: "string",
                name: "rank",
                label: "Rank",
                options: ["Chief", "Division Chief", "Battalion Chief", "Captain", "Lieutenant"],
              },
              {
                type: "string",
                name: "staff_type",
                label: "Type",
                options: ["staff", "volunteer"],
                required: true,
              },
              {
                type: "string",
                name: "roles",
                label: "Roles",
                options: [ "FireFighter", "Wildland Firefighter", "EMT", "Medic", "Apparatus Operator",  "Marine Crew", "Support", "Admin"],
                list: true,
              },
              {
                type: "image",
                name: "photo",
                label: "Photo",
              },
            ],
          },
          {
            type: "rich-text",
            name: "body",
            label: "Body",
            isBody: true,
          },
        ],
      },
      {
        name: "homepage",
        label: "Homepage",
        path: "src/pages",
        format: "mdx",
        match: {
          include: "homepage",
        },
        ui: {
          allowedActions: {
            create: false,
            delete: false,
          },
        },
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "number",
            name: "number_news_stories",
            label: "Number of News Stories to Display",
          },
          {
            type: "object",
            name: "image_gallery",
            label: "Image Gallery",
            list: true,
            ui: {
              itemProps: (item) => ({
                label: item?.image_alt || item?.image || "New Image",
              }),
            },
            fields: [
              {
                type: "image",
                name: "image",
                label: "Image",
                required: true,
              },
              {
                type: "string",
                name: "image_alt",
                label: "Alt Text",
                required: true,
              },
            ],
          },
        ],
      },
      {
        name: "page",
        label: "Pages",
        path: "src/pages",
        format: "mdx",
        match: {
          exclude: "{about/emergency-personnel-data,homepage}",
        },
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "number",
            name: "nav_order",
            label: "Navigation Order",
            description: "Order in navigation menu (lower numbers appear first)",
          },
          {
            type: "string",
            name: "nav_title",
            label: "Navigation Title",
            description: "Override title shown in navigation (optional)",
          },
          {
            type: "boolean",
            name: "nav_hidden",
            label: "Hide from Navigation",
            description: "Page will still be accessible but won't appear in menu",
          },
          {
            type: "rich-text",
            name: "sidebar",
            label: "Sidebar"
          },
          {
            type: "rich-text",
            name: "body",
            label: "Body",
            isBody: true,
            templates: [
              {
                name: "StyledImage",
                label: "Styled Image",
                ui: {
                  defaultItem: {
                    size: "medium",
                    align: "center",
                  },
                },
                fields: [
                  {
                    type: "image",
                    name: "src",
                    label: "Image",
                    required: true,
                  },
                  {
                    type: "string",
                    name: "alt",
                    label: "Alt Text"
                  },
                  {
                    type: "string",
                    name: "size",
                    label: "Size",
                    options: [
                      { value: "small", label: "Small (25%)" },
                      { value: "medium", label: "Medium (50%)" },
                      { value: "large", label: "Large (75%)" },
                      { value: "full", label: "Full Width" },
                    ],
                  },
                  {
                    type: "string",
                    name: "align",
                    label: "Alignment",
                    options: [
                      { value: "left", label: "Float Left" },
                      { value: "center", label: "Center" },
                      { value: "right", label: "Float Right" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});
