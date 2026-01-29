import { describe, it, before } from "node:test";
import assert from "node:assert";

/**
 * Tests for scripts/msgraph-client.mjs
 *
 * Since the MSGraphClient uses the official @microsoft/microsoft-graph-client SDK,
 * we test constructor validation and method existence. The SDK handles HTTP.
 */

describe("MSGraphClient", () => {
  let MSGraphClient;

  before(async () => {
    const module = await import("../scripts/msgraph-client.mjs");
    MSGraphClient = module.MSGraphClient;
  });

  describe("constructor", () => {
    it("throws when tenantId is missing", () => {
      assert.throws(
        () => new MSGraphClient({ clientId: "id", clientSecret: "secret" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when clientId is missing", () => {
      assert.throws(
        () => new MSGraphClient({ tenantId: "tenant", clientSecret: "secret" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when clientSecret is missing", () => {
      assert.throws(
        () => new MSGraphClient({ tenantId: "tenant", clientId: "id" }),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("throws when all credentials are missing", () => {
      assert.throws(
        () => new MSGraphClient({}),
        /requires tenantId, clientId, and clientSecret/
      );
    });

    it("creates client with valid credentials", () => {
      const client = new MSGraphClient({
        tenantId: "00000000-0000-0000-0000-000000000000",
        clientId: "00000000-0000-0000-0000-000000000001",
        clientSecret: "test-secret",
      });
      assert.ok(client);
    });
  });

  describe("method signatures", () => {
    let client;

    before(() => {
      client = new MSGraphClient({
        tenantId: "00000000-0000-0000-0000-000000000000",
        clientId: "00000000-0000-0000-0000-000000000001",
        clientSecret: "test-secret",
      });
    });

    it("has listUsers method", () => {
      assert.strictEqual(typeof client.listUsers, "function");
    });

    it("has getUser method", () => {
      assert.strictEqual(typeof client.getUser, "function");
    });

    it("has getGroupMembers method", () => {
      assert.strictEqual(typeof client.getGroupMembers, "function");
    });

    it("has getUserPhoto method", () => {
      assert.strictEqual(typeof client.getUserPhoto, "function");
    });

    it("has getUserGroups method", () => {
      assert.strictEqual(typeof client.getUserGroups, "function");
    });

    it("has listGroups method", () => {
      assert.strictEqual(typeof client.listGroups, "function");
    });

    it("has getServicePrincipal method", () => {
      assert.strictEqual(typeof client.getServicePrincipal, "function");
    });

    it("has fetchAllPages generator method", () => {
      assert.strictEqual(typeof client.fetchAllPages, "function");
    });
  });

  describe("SDK integration", () => {
    it("uses official @microsoft/microsoft-graph-client SDK", async () => {
      const { Client } = await import("@microsoft/microsoft-graph-client");
      assert.strictEqual(typeof Client, "function");
      assert.strictEqual(typeof Client.initWithMiddleware, "function");
    });

    it("uses @azure/identity for authentication", async () => {
      const { ClientSecretCredential } = await import("@azure/identity");
      assert.strictEqual(typeof ClientSecretCredential, "function");
    });
  });
});
