# Static Website with TinaCMS, 11ty, and Azure

## Prerequisites

1. GitHub account and repository
2. Azure subscription
3. Microsoft 365 tenant with Azure AD
4. Node.js 22+ installed

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
5. Generate a private key and download it
6. Install the app on your repository

### 2. Create Azure AD App Registration

1. Go to Azure Portal > Azure Active Directory > App registrations
2. Click "New registration"
3. Fill in:
   - **Name**: Static Site CMS
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**:
     - Platform: Web
     - URL: `https://<your-site>.azurestaticapps.net/.auth/login/aad/callback`
4. Click "Register"
5. Copy the **Application (client) ID**
6. Go to "Certificates & secrets" > "New client secret"
7. Copy the secret value
8. Go to "Token configuration" > "Add groups claim" > Select "Security groups"

### 3. Create Azure AD Security Group

1. Go to Azure Portal > Azure Active Directory > Groups
2. Click "New group"
3. Fill in:
   - **Group type**: Security
   - **Group name**: Content Editors
4. Add members who should have CMS access
5. Copy the **Object ID** of the group

### 4. Create Azure Static Web App

1. Go to Azure Portal > Create a resource > Static Web App
2. Fill in:
   - **Subscription**: Your subscription
   - **Resource Group**: Create new or use existing
   - **Name**: your-site-name
   - **Plan type**: Free
   - **Region**: Choose closest
   - **Deployment source**: GitHub
   - **Organization**: Your GitHub org
   - **Repository**: Your repo
   - **Branch**: main
   - **Build presets**: Custom
   - **App location**: _site
   - **Api location**: api
   - **Output location**: (leave empty)
3. Click "Review + create"
4. After deployment, go to the resource
5. Copy the deployment token

### 5. Configure GitHub Secrets

Go to your GitHub repository > Settings > Secrets and variables > Actions

Add these secrets:
- `AZURE_STATIC_WEB_APPS_API_TOKEN`: (from step 4)
- `AAD_CLIENT_ID`: (from step 2)
- `AAD_CLIENT_SECRET`: (from step 2)
- `ALLOWED_EDITOR_GROUPS`: (Object ID from step 3)
- `GITHUB_TOKEN`: (automatically provided by GitHub)

### 6. Configure Azure Static Web App Settings

1. Go to your Static Web App in Azure Portal
2. Click "Configuration"
3. Add these application settings:
   - `GITHUB_TOKEN`: Personal access token or GitHub App token
   - `GITHUB_OWNER`: Your GitHub username/org
   - `GITHUB_REPO`: Your repository name
   - `AAD_CLIENT_ID`: (from step 2)
   - `AAD_CLIENT_SECRET`: (from step 2)
   - `ALLOWED_EDITOR_GROUPS`: (Object ID from step 3)

### 7. Update staticwebapp.config.json

Replace `<TENANT_ID>` in `staticwebapp.config.json` with your Azure AD tenant ID

### 8. Deploy


## Local Development

### Prerequisites

- Node.js 22+ (check with `node --version`)
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
