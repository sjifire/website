# Static Website with TinaCMS, 11ty, and Azure

## Prerequisites

1. GitHub account and repository
2. Azure subscription
3. Microsoft Entra ID (Azure AD) tenant
4. Node.js 20+ installed

## Setup Instructions

### 1. Create GitHub App

1. Go to GitHub Settings > Developer settings > GitHub Apps
2. Click "New GitHub App"
3. Fill in:
   - **Name**: Your Site CMS Bot
   - **Homepage URL**: Your site URL
   - **Webhook**: Uncheck "Active"
   - **Repository permissions**:
     - Contents: Read & Write
     - Metadata: Read-only
   - **Where can this GitHub App be installed**: Only on this account
4. Click "Create GitHub App"
5. Note the **App ID** (you'll need this later)
6. Generate a private key and download it
7. Install the app on your repository
8. Note the **Installation ID** from the URL after installing (e.g., `github.com/settings/installations/12345678`)

### 2. Create Microsoft Entra ID App Registration

This app registration handles authentication for the CMS admin panel.

1. Go to Azure Portal > Microsoft Entra ID > App registrations
2. Click "New registration"
3. Fill in:
   - **Name**: Static Site CMS
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Leave blank for now (we'll add it after creating the Static Web App)
4. Click "Register"
5. Copy the **Application (client) ID** - save this as `AAD_CLIENT_ID`
6. Go to "Certificates & secrets" > "New client secret"
7. Add a description and expiration, click "Add"
8. Copy the secret **Value** immediately - save this as `AAD_CLIENT_SECRET`

### 3. Create Azure Cosmos DB for MongoDB (vCore)

TinaCMS uses Cosmos DB to store content indexing data.

1. Go to Azure Portal > Create a resource > Azure Cosmos DB
2. Select **Azure Cosmos DB for MongoDB** > **vCore cluster**
3. Fill in:
   - **Cluster name**: your-site-tina
   - **Cluster tier**: Free tier (M25, burstable)
4. Set admin username and password
5. After deployment, go to the resource
6. Click "Connection strings" and copy the connection string
7. Replace `<user>` and `<password>` with your admin credentials
8. Save the full connection string as `COSMOS_DB_CONNECTION_STRING`

### 4. Create Azure Static Web App

1. Go to Azure Portal > Create a resource > Static Web App
2. Fill in:
   - **Subscription**: Your subscription
   - **Resource Group**: Create new or use existing
   - **Name**: your-site-name
   - **Plan type**: Free (or Standard for custom auth)
   - **Region**: Choose closest
   - **Deployment source**: GitHub
   - **Organization**: Your GitHub org
   - **Repository**: Your repo
   - **Branch**: main
3. Build Details:
   - **Build presets**: Custom
   - **App location**: `/`
   - **Api location**: `api`
   - **Output location**: `_site`
4. Click "Review + create"
5. After deployment, note your site URL (e.g., `https://your-site.azurestaticapps.net`)

### 5. Configure Entra ID Redirect URI

Now that you have your Static Web App URL:

1. Go back to Microsoft Entra ID > App registrations > your app
2. Click "Authentication" in the left menu
3. Click "Add a platform" > "Web"
4. Enter redirect URI: `https://<your-site>.azurestaticapps.net/.auth/login/aad/callback`
5. Click "Configure"

**Important**: The platform must be **Web**, not "Single-page application"

### 6. Link Authentication to Static Web App

1. Go to your Static Web App in Azure Portal
2. Click "Settings" > "Authentication" in the left menu
3. Click "Add identity provider"
4. Select "Microsoft"
5. Fill in:
   - **Application (client) ID**: Your `AAD_CLIENT_ID`
   - **Client secret**: Your `AAD_CLIENT_SECRET`
   - **Issuer URL**: `https://login.microsoftonline.com/<TENANT_ID>/v2.0` (replace with your tenant ID)
   - **Allowed token audiences**: `api://<AAD_CLIENT_ID>`
6. Click "Add"

To find your Tenant ID: Microsoft Entra ID > Overview > "Tenant ID"

### 7. Configure Static Web App Environment Variables

1. Go to your Static Web App > "Settings" > "Environment variables"
2. Add these variables:

| Name | Value | Description |
|------|-------|-------------|
| `COSMOS_DB_CONNECTION_STRING` | `mongodb+srv://...` | Cosmos DB connection string from step 3 |
| `COSMOS_DB_NAME` | `tinacms` | Database name (optional, defaults to "tinacms") |
| `GITHUB_APP_ID` | `123456` | GitHub App ID from step 1 |
| `GITHUB_APP_PRIVATE_KEY` | `-----BEGIN RSA...` | Contents of downloaded .pem file |
| `GITHUB_APP_INSTALLATION_ID` | `12345678` | Installation ID from step 1 |
| `GITHUB_OWNER` | `your-org` | GitHub username or organization |
| `GITHUB_REPO` | `your-repo` | Repository name |
| `GITHUB_BRANCH` | `main` | Branch for content (optional, defaults to "main") |
| `CLOUDINARY_API_KEY` | `123456789012345` | Cloudinary API key (optional, for image optimization) |
| `CLOUDINARY_API_SECRET` | `abcdefg...` | Cloudinary API secret (optional, for image optimization) |

### 8. Deploy

Push to your repository. The GitHub Action will automatically build and deploy.

After deployment:
- Site: `https://<your-site>.azurestaticapps.net/`
- Admin: `https://<your-site>.azurestaticapps.net/admin/` (requires Entra ID login)


## Local Development

### Prerequisites

- Node.js 20+ (check with `node --version`)
- npm (comes with Node.js)

### Quick Start (Local Mode)

```bash
# Clone the repository
git clone <repository-url>
cd website

# Install dependencies
npm install

# Start local development server with TinaCMS
npm run tina:dev
```

This will start:
- **Eleventy** at http://localhost:8080 (site preview)
- **TinaCMS** at http://localhost:8080/admin (content editor)

Changes are saved directly to local files. No credentials needed.

### Testing with Cosmos DB (Local-Prod Mode)

To test the full production setup locally (connecting to Azure Cosmos DB):

**Terminal 1 - Start the API:**
```bash
# Install API dependencies (first time only)
npm run api:install

# Start Azure Functions API
npm run api:dev
```

**Terminal 2 - Start TinaCMS:**
```bash
npm run tina:local-prod
```

This connects to your Cosmos DB instance. Requires `.env` file

See `.env.example` for all required variables.

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Eleventy only (no CMS) |
| `npm run tina:dev` | Start Eleventy + TinaCMS in local mode |
| `npm run tina:local-prod` | Start TinaCMS connecting to local API (requires api:dev) |
| `npm run api:dev` | Start Azure Functions API locally |
| `npm run api:install` | Install API dependencies |
| `npm run build` | Build the site for production |
| `npm run tina:build` | Build TinaCMS + site for deployment |
| `npm run lint` | Run ESLint and Stylelint |
| `npm test` | Run Playwright tests |

### Project Structure

```
src/
├── _data/          # Global data files (JSON, YAML)
├── _includes/      # Nunjucks templates and partials
├── assets/         # Static assets (images, PDFs)
│   └── images/     # Image files (managed by TinaCMS)
├── css/            # Stylesheets
├── pages/          # Page content (MDX files)
│   ├── about/      # About section pages
│   └── services/   # Services section pages
└── posts/          # News/blog posts (JSON)

tina/
├── config.ts       # TinaCMS schema configuration
├── database.ts     # Database config for build
└── __generated__/  # Auto-generated types and client

api/
├── tina/           # TinaCMS API backend
│   └── database.mjs  # Cosmos DB + GitHub App connection
└── src/functions/  # Azure Functions
```

### Notes

- **Local mode** (`tina:dev`): No credentials needed, changes saved to local files
- **Local-prod mode** (`tina:local-prod`): Tests full Cosmos DB integration locally
- The site auto-reloads when files change

### Image Optimization

When images are uploaded via the TinaCMS media manager, they are automatically optimized before being committed to the GitHub repository. This reduces repository bloat from large image uploads.

**How it works:**
- Images larger than 500KB are sent to Cloudinary for optimization
- Images are resized to max 1600×1600 pixels (preserving aspect ratio)
- Quality is automatically optimized while maintaining visual fidelity
- Original format is preserved (PNG stays PNG, JPG stays JPG)
- If the optimized image isn't smaller, the original is kept
- SVG and PDF files are not modified

**Why Cloudinary API credentials are needed:**
The site already uses Cloudinary's fetch URLs for runtime image delivery (serving WebP/AVIF to supported browsers). The Upload API credentials (`CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`) enable server-side optimization *before* images are stored in git, keeping the repository small.

To get credentials: https://console.cloudinary.com/settings/api-keys

**Without credentials:** Image uploads still work normally, they're just stored at their original size.
