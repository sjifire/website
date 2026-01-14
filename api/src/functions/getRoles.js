const { app } = require("@azure/functions");

// Admin group ID is configured in site.json
const siteConfig = require("../../../src/_data/site.json");
const ADMIN_GROUP_ID = siteConfig.adminGroupId;

app.http("getRoles", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: ".auth/roles",
  handler: async (request, context) => {
    const roles = [];

    try {
      const body = await request.json();
      const claims = body.claims || [];

      // Look for group claims that match our admin group
      const isAdmin = claims.some(
        (claim) => claim.typ === "groups" && claim.val === ADMIN_GROUP_ID
      );

      if (isAdmin) {
        roles.push("admin");
      }

      context.log("GetRoles:", { userId: body.userId, roles });

      return {
        status: 200,
        jsonBody: { roles },
      };
    } catch (error) {
      context.error("GetRoles error:", error.message);
      return {
        status: 200,
        jsonBody: { roles },
      };
    }
  },
});
