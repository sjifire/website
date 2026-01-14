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

### 7. Configure Admin Access Control

The admin panel (`/admin`) requires users to be members of a specific Entra ID security group. This provides fine-grained control over who can edit site content.

#### Create a Security Group

1. Go to Azure Portal > Microsoft Entra ID > Groups
2. Click "New group"
3. Fill in:
   - **Group type**: Security
   - **Group name**: Website Admins
   - **Group description**: Users with admin access to the website CMS
   - **Membership type**: Assigned
4. Click "Create"
5. Open the group and copy the **Object ID** (you'll need this for configuration)

#### Configure Group Claims in App Registration

The app registration must be configured to include group memberships in the authentication token:

1. Go to Microsoft Entra ID > App registrations > your app
2. Click "Token configuration" in the left menu
3. Click "+ Add groups claim"
4. Select **Security groups**
5. Under "ID" token, check **Group ID**
6. Click "Add"

#### Update Site Configuration

Add the security group's Object ID to `src/_data/site.json`:

```json
{
  "adminGroupId": "your-group-object-id-here",
  ...
}
```

#### Adding Users

To grant someone admin access:

1. Go to Microsoft Entra ID > Groups > Website Admins
2. Click "Members" in the left menu
3. Click "+ Add members"
4. Search for and select the user(s)
5. Click "Select"

The user can now log in at `/admin` with their Microsoft account.

#### Removing Users

To revoke admin access:

1. Go to Microsoft Entra ID > Groups > Website Admins
2. Click "Members" in the left menu
3. Check the box next to the user(s) to remove
4. Click "Remove"

The user will be denied access on their next login attempt.

### 8. Configure Static Web App Environment Variables

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

### 9. Deploy

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

### Personnel Directory Sync (Microsoft 365)

Personnel data and photos can be automatically synced from Microsoft 365 (Entra ID). A GitHub Action runs daily to update the personnel directory.

#### Entra ID App Registration

1. Go to Azure Portal > Microsoft Entra ID > App registrations
2. Click "New registration"
3. Fill in:
   - **Name**: Personnel Sync
   - **Supported account types**: Accounts in this organizational directory only
4. Click "Register"
5. Note the **Application (client) ID** and **Directory (tenant) ID**
6. Go to "API permissions" > "Add a permission" > "Microsoft Graph" > "Application permissions"
7. Add these permissions:
   - `User.Read.All` - Read user profiles
   - `GroupMember.Read.All` - Read group memberships
8. Click "Grant admin consent for [your org]"
9. Go to "Certificates & secrets" > "New client secret"
10. Create a secret and copy the **Value** immediately

#### Entra ID Fields Used

The sync reads these fields from each user's Entra ID profile:

| Field | Usage |
|-------|-------|
| `givenName` | First name |
| `surname` | Last name |
| `displayName` | Fallback display name |
| `jobTitle` | Parsed for rank (Chief, Captain, etc.) and title |
| `id` | Used to fetch profile photo and group memberships |

**Job Title Parsing:**
- Ranks are extracted from jobTitle: Chief, Assistant Chief, Battalion Chief, Division Chief, Captain, Lieutenant, Apparatus Operator, Firefighter
- Examples: "Captain - Training Officer" → rank: Captain, title: Training Officer
- Separators supported: dash (-), colon (:), underscore (_), comma (,)

#### Configuration

**GitHub Secrets** (Settings > Secrets and variables > Actions > Secrets):

| Secret | Description |
|--------|-------------|
| `MS_GRAPH_TENANT_ID` | Entra ID tenant ID |
| `MS_GRAPH_CLIENT_ID` | App registration client ID |
| `MS_GRAPH_CLIENT_SECRET` | App registration client secret |
| `CLOUDINARY_API_KEY` | For photo optimization |
| `CLOUDINARY_API_SECRET` | For photo optimization |

**Site Configuration** (`src/_data/site.json`):

```json
{
  "personnelSync": {
    "personnelGroup": "group-id-guid",
    "staffGroups": ["group-id-1", "group-id-2"],
    "volunteerGroups": ["group-id-1", "group-id-2"],
    "roleGroups": {
      "group-id-guid": "Role Name"
    },
    "supersedeRoles": {
      "Firefighter": ["Wildland Firefighter"]
    },
    "syncPhotos": true
  }
}
```

| Setting | Description |
|---------|-------------|
| `personnelGroup` | Only sync members of this Entra ID group |
| `staffGroups` | Group IDs that indicate staff (vs volunteer) |
| `volunteerGroups` | Group IDs that indicate volunteer |
| `roleGroups` | Map group IDs to role names displayed on the site |
| `supersedeRoles` | When a role is present, hide roles it supersedes |
| `syncPhotos` | Whether to download profile photos |

To find group IDs: Azure Portal > Groups > [group name] > Object ID

#### Local Testing

```bash
# Set environment variables
export MS_GRAPH_TENANT_ID="your-tenant-id"
export MS_GRAPH_CLIENT_ID="your-client-id"
export MS_GRAPH_CLIENT_SECRET="your-client-secret"

# Run sync
npm run sync-personnel

# Force refresh all photos
npm run sync-personnel -- --force-refresh
```
