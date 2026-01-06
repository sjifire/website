import { defineConfig } from "tinacms";

export default defineConfig({
  branch:   process.env.TINA_BRANCH || "main",
  clientId: process.env.TINA_CLIENT_ID || "",
  token:    process.env.TINA_TOKEN || "",

  build: {
    outputFolder: "admin",
    publicFolder: "_site",
  },

  media: {
    tina: {
      mediaRoot: "assets/images",
      publicFolder: "src",
    },
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
            name: "cloudinarySiteId",
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
        name: "emergencyPersonnel",
        label: "Emergency Personnel",
        path: "src/pages/about",
        format: "mdx",
        match: {
          include: "emergency-personnel",
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
          exclude: "{about/emergency-personnel,homepage}",
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
            type: "boolean",
            name: "draft",
            label: "Draft (hide from site)",
            ui: {
              defaultValue: false,
            },
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
