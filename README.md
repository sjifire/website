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
   - **Plan type**: Standard (required for role-based admin access)
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

### 6. Configure Authentication

Authentication is configured via `staticwebapp.config.json` using Custom mode with Entra ID. The config file already contains the identity provider settings - you just need to:

1. Update the `openIdIssuer` URL in `staticwebapp.config.json` with your tenant ID:
   ```json
   "openIdIssuer": "https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0"
   ```

2. Add environment variables to your Static Web App (see step 8)

To find your Tenant ID: Microsoft Entra ID > Overview > "Tenant ID"

### 7. Configure Admin Access Control

The admin panel (`/admin`) uses Entra ID Enterprise Application assignment for access control. Only users explicitly assigned to the application can access the admin interface.

**Security Verification:** The application uses Microsoft Graph API to verify that "User assignment required" is enabled. If this setting is disabled (or cannot be verified), all admin access is denied. This prevents accidental exposure if the setting is changed. This requires the `MS_GRAPH_*` environment variables and `Application.Read.All` permission on the Personnel Sync app (see Personnel Sync setup).

#### Initial Setup: Enable User Assignment

This only needs to be done once when setting up the application:

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **Enterprise applications**
2. Search for and select **"website-admin"**
3. Click **Properties** in the left sidebar
4. Set **"Assignment required?"** to **Yes**
5. Click **Save**

#### Granting Admin Access

To give a user access to `/admin`:

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **Enterprise applications**
2. Search for and select **"website-admin"**
3. Click **Users and groups** in the left sidebar
4. Click **+ Add user/group**
5. Click **None Selected** under "Users"
6. Search for the user by name or email (e.g., `kenglish@sjifire.org`)
7. Click on the user to select them (checkmark appears)
8. Click **Select**
9. Click **Assign**

The user can now log in at `/admin` with their Microsoft account. Changes take effect immediately.

#### Revoking Admin Access

To remove a user's access to `/admin`:

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **Enterprise applications**
2. Search for and select **"website-admin"**
3. Click **Users and groups** in the left sidebar
4. Find the user in the list
5. Click the checkbox next to their name
6. Click **Remove** in the toolbar
7. Confirm the removal

The user will see an error (AADSTS50105) on their next login attempt. If they're currently logged in, they'll lose access when their session expires or they log out.

### 8. Configure Static Web App Environment Variables

1. Go to your Static Web App > "Settings" > "Environment variables"
2. Add these variables:

| Name | Value | Description |
|------|-------|-------------|
| `AAD_CLIENT_ID` | `xxxxxxxx-xxxx-...` | Entra ID app registration client ID (from step 2) |
| `AAD_CLIENT_SECRET` | `xxxxxxxx` | Entra ID app registration client secret (from step 2) |
| `COSMOS_DB_CONNECTION_STRING` | `mongodb+srv://...` | Cosmos DB connection string from step 3 |
| `COSMOS_DB_NAME` | `tinacms` | Database name (optional, defaults to "tinacms") |
| `GITHUB_APP_ID` | `123456` | GitHub App ID from step 1 |
| `GITHUB_APP_PRIVATE_KEY` | `-----BEGIN RSA...` | Contents of downloaded .pem file |
| `GITHUB_APP_INSTALLATION_ID` | `12345678` | Installation ID from step 1 |
| `GITHUB_OWNER` | `your-org` | GitHub username or organization |
| `GITHUB_REPO` | `your-repo` | Repository name |
| `MS_GRAPH_TENANT_ID` | `xxxxxxxx-xxxx-...` | Entra ID tenant ID (for admin security verification) |
| `MS_GRAPH_CLIENT_ID` | `xxxxxxxx-xxxx-...` | MS Graph app client ID (from Personnel Sync setup) |
| `MS_GRAPH_CLIENT_SECRET` | `xxxxxxxx` | MS Graph app client secret (from Personnel Sync setup) |
| `GITHUB_BRANCH` | `main` | Branch for content (optional, defaults to "main") |
| `CLOUDINARY_API_KEY` | `123456789012345` | Cloudinary API key (optional, for image optimization) |
| `CLOUDINARY_API_SECRET` | `abcdefg...` | Cloudinary API secret (optional, for image optimization) |

### 9. Deploy

Push to your repository. The GitHub Action will automatically build and deploy.

After deployment:
- Site: `https://<your-site>.azurestaticapps.net/`
- Admin: `https://<your-site>.azurestaticapps.net/admin/` (requires Entra ID login)

### Troubleshooting Authentication

#### Useful Endpoints

| Endpoint | Description |
|----------|-------------|
| `/.auth/me` | Shows current user info and assigned roles |
| `/.auth/logout` | Logs out and clears session |
| `/.auth/login/aad` | Triggers Entra ID login |

#### Common Issues

**403 Forbidden after logging in**

You're authenticated but don't have the "admin" role. Check `/.auth/me` to see your current roles.

This should not happen with the current configuration. If it does, verify the `/api/auth/get-roles` function is deployed correctly.

**AADSTS50105: User not assigned to the application**

The user is not assigned to the Enterprise Application:
1. Go to Entra ID > Enterprise applications > your app
2. Click "Users and groups"
3. Add the user (see "Adding Users" above)

**Changes to Entra ID not taking effect**

After making changes in Azure Portal (redirect URIs, group membership, etc.), you must log out and log back in. Your session caches the authentication state from when you first logged in.

1. Go to `/.auth/logout`
2. Go to `/admin` to trigger fresh login

**AADSTS700054: response_type 'id_token' is not enabled**

Enable ID tokens in your app registration:
1. Azure Portal > Entra ID > App registrations > your app
2. Authentication > Implicit grant and hybrid flows
3. Check "ID tokens"
4. Save

**AADSTS50011: redirect URI mismatch**

Add all your site URLs to the app registration:
1. Azure Portal > Entra ID > App registrations > your app
2. Authentication > Add URI
3. Add: `https://<your-site>.azurestaticapps.net/.auth/login/aad/callback`
4. For PR previews, also add the preview URL pattern

**Environment variables not working in preview deployments**

Azure Static Web Apps environment variables are per-environment. Variables set for "production" don't apply to PR preview environments. Set them for each environment in Azure Portal > Static Web App > Environment variables.


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

**Manual optimization (CLI):**

For images added outside of TinaCMS (e.g., from local folders), use the optimization script:

```bash
# Single file with new name/location
node scripts/optimize-image.mjs ~/Downloads/photo.jpg src/assets/media/descriptive_name.jpg

# Optimize existing files in-place
node scripts/optimize-image.mjs src/assets/media/gallery/

# Optimize specific files in-place
node scripts/optimize-image.mjs file1.jpg file2.jpg file3.jpg
```

The script automatically skips files under 500KB and skips if the optimized result isn't smaller. Typically reduces file sizes by 80-90%. Requires `.env` with Cloudinary credentials.

### Photo Gallery

The site includes a photo gallery that displays images from a configurable folder. Images appear on both the gallery page (`/about/gallery/`) and the homepage carousel.

**How it works:**
- Images are automatically discovered from `src/assets/media/gallery/` (configurable)
- Supported formats: JPG, JPEG, PNG, GIF, WebP
- Alt text is auto-generated from filenames (underscores/dashes become spaces)
- Homepage carousel shows a random selection of images (shuffled at build time)
- Gallery page shows all images in a grid with a carousel-style lightbox viewer

**Adding images:**
Simply drop image files into the gallery folder. They'll automatically appear on the next build.

**Configuration:**

Gallery folder is configured in `src/_data/site.json`:

```json
{
  "gallery_folder": "src/assets/media/gallery"
}
```

Homepage carousel count is configured in `src/_data/homepage.json`:

```json
{
  "carousel": {
    "image_count": 5
  }
}
```

| Setting | File | Default | Description |
|---------|------|---------|-------------|
| `gallery_folder` | `site.json` | `src/assets/media/gallery` | Path from project root to gallery images |
| `carousel.image_count` | `homepage.json` | `5` | Number of random images to show in homepage carousel |

**Gallery page features:**
- Responsive thumbnail grid
- Click to open carousel-style lightbox
- Keyboard navigation (arrow keys, Escape to close)
- Image counter showing current position

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
   - `Application.Read.All` - Verify admin portal security settings
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
