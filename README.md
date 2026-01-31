# Static Website with TinaCMS, 11ty, and Azure

## Prerequisites

- Node.js 20+
- GitHub account with a repository
- Azure subscription with Microsoft Entra ID (Azure AD)

## Required Services

---

### 1. GitHub App

Create a GitHub App for TinaCMS to commit content changes.

| Permissions | Note these values |
|-------------|-------------------|
| Contents: Read & Write | App ID |
| Metadata: Read-only | Installation ID (from URL after installing) |
| | Private key (.pem file contents) |

---

### 2. Microsoft Entra ID App Registration

Create an app registration for admin authentication.

| Configuration | Note these values |
|---------------|-------------------|
| Accounts in this organizational directory only | Application (client) ID |
| Redirect URI: `https://<your-site>.azurestaticapps.net/.auth/login/aad/callback` (Web platform) | Client secret |
| Enable ID tokens (Authentication > Implicit grant) | Directory (tenant) ID |

---

### 3. Azure Cosmos DB for MongoDB (vCore)

TinaCMS uses Cosmos DB for content indexing. Free tier (M25) works fine.

**Note:** Connection string with credentials

---

### 4. Azure Static Web App

| Build setting | Value |
|---------------|-------|
| App location | `/` |
| API location | `api` |
| Output location | `_site` |
| Plan type | Standard (required for custom auth) |

---

### 5. Cloudinary

For image optimization. Get API credentials from https://console.cloudinary.com/settings/api-keys

---

### 6. Microsoft Graph API

For personnel sync and admin security verification. Create a separate app registration with these application permissions:
- `User.Read.All`
- `GroupMember.Read.All`
- `Application.Read.All`

Grant admin consent after adding permissions.

## Environment Variables

### Azure Static Web App

Set these in Azure Static Web App > Settings > Environment variables:

| Variable | Description |
|----------|-------------|
| `AAD_CLIENT_ID` | Entra ID app client ID |
| `AAD_CLIENT_SECRET` | Entra ID app client secret |
| `COSMOS_DB_CONNECTION_STRING` | Cosmos DB connection string |
| `COSMOS_DB_NAME` | Database name (default: "tinacms") |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (.pem contents) |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App installation ID |
| `GITHUB_OWNER` | GitHub org/username |
| `GITHUB_REPO` | Repository name |
| `GITHUB_BRANCH` | Branch for content (default: "main") |
| `MS_GRAPH_TENANT_ID` | Entra ID tenant ID |
| `MS_GRAPH_CLIENT_ID` | MS Graph app client ID |
| `MS_GRAPH_CLIENT_SECRET` | MS Graph app client secret |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

### Azure Key Vault (for GitHub Actions)

GitHub Actions fetch secrets from Azure Key Vault `gh-website-utilities` using OIDC authentication. No secrets are stored in GitHub.

**Pull secrets for local development:**
```bash
./scripts/pull-secrets.sh           # Pull all secrets to .env
./scripts/pull-secrets.sh --list    # List available secrets
```

Requires Azure CLI login (`az login`).

## Authentication Configuration

Update `staticwebapp.config.json` with your tenant ID:

```json
"openIdIssuer": "https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0"
```

## Admin Access Control

Admin access is controlled via Entra ID Enterprise Application assignments.

**Setup (one-time):**
1. Go to Entra ID > Enterprise applications > your app
2. Set "Assignment required?" to **Yes** in Properties

**Managing access:**
- Add users: Enterprise applications > your app > Users and groups > Add
- Remove users: Select user > Remove

The app verifies this setting via Graph API. If "Assignment required" is disabled or can't be verified, admin access is denied.

## Local Development

```bash
npm install          # Install dependencies
npm run tina:dev     # Start Eleventy + TinaCMS (local mode)
```

- Site: http://localhost:8080
- Admin: http://localhost:8080/admin

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Eleventy only (no CMS) |
| `npm run tina:dev` | Eleventy + TinaCMS in local mode |
| `npm run tina:local-prod` | TinaCMS with Cosmos DB (requires api:dev) |
| `npm run api:dev` | Azure Functions API locally |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run lint` | Run linters |

### Testing with Cosmos DB

To test the full production setup locally, create a `.env` file (see `.env.example`) and run:

```bash
npm run api:dev      # Terminal 1
npm run tina:local-prod  # Terminal 2
```

## Image Optimization

Images uploaded via TinaCMS are automatically optimized if Cloudinary credentials are configured.

For manual optimization:

```bash
node scripts/optimize-image.mjs src/assets/media/gallery/
```

## Personnel Sync

Personnel data syncs daily from Microsoft 365 via GitHub Actions.

**Configuration** (`src/_data/site.json`):

```json
{
  "personnelSync": {
    "personnelGroup": "group-id",
    "staffGroups": ["group-id"],
    "volunteerGroups": ["group-id"],
    "roleGroups": { "group-id": "Role Name" },
    "syncPhotos": true
  }
}
```

Find group IDs in Azure Portal > Groups > Object ID.

**Local testing:**

```bash
export MS_GRAPH_TENANT_ID="..."
export MS_GRAPH_CLIENT_ID="..."
export MS_GRAPH_CLIENT_SECRET="..."
npm run sync-personnel
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 403 after login | Check `/.auth/me` for roles. Verify user is assigned in Enterprise App. |
| AADSTS50105 | User not assigned to Enterprise Application |
| AADSTS700054 | Enable ID tokens in app registration |
| AADSTS50011 | Add redirect URI to app registration |
| Changes not taking effect | Log out at `/.auth/logout` and log back in |

**Useful endpoints:**
- `/.auth/me` - Current user info and roles
- `/.auth/logout` - Log out
- `/.auth/login/aad` - Trigger login
