#!/usr/bin/env node
/**
 * Test Microsoft Graph API connection and display sample data
 * Run: node src/scripts/test-msgraph.mjs
 *
 * Requires: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
 */

import 'dotenv/config';
import { MSGraphClient } from './msgraph-client.mjs';

async function main() {
  console.log('Microsoft Graph API Test');
  console.log('========================\n');

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.error('Missing required environment variables:');
    if (!tenantId) console.error('  - MS_GRAPH_TENANT_ID');
    if (!clientId) console.error('  - MS_GRAPH_CLIENT_ID');
    if (!clientSecret) console.error('  - MS_GRAPH_CLIENT_SECRET');
    process.exit(1);
  }

  const client = new MSGraphClient({ tenantId, clientId, clientSecret });

  // Test 1: List users (first 10)
  console.log('1. Fetching users (first 10)...\n');
  try {
    const usersResponse = await client.listUsers({
      filter: "userType eq 'Member'",
      select: ['id', 'displayName', 'givenName', 'surname', 'jobTitle', 'mail', 'userPrincipalName'],
      top: 10,
    });

    console.log(`Found ${usersResponse.value?.length || 0} users:\n`);
    console.log(JSON.stringify(usersResponse.value, null, 2));
  } catch (error) {
    console.error('Error fetching users:', error.message);
  }

  // Test 2: List groups (first 10)
  console.log('\n\n2. Fetching groups (first 10)...\n');
  try {
    const groupsResponse = await client.listGroups({
      select: ['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled'],
      top: 10,
    });

    console.log(`Found ${groupsResponse.value?.length || 0} groups:\n`);
    console.log(JSON.stringify(groupsResponse.value, null, 2));
  } catch (error) {
    console.error('Error fetching groups:', error.message);
  }

  // Test 3: If a personnel group is configured, show its members
  const personnelGroupId = process.env.MS_GRAPH_PERSONNEL_GROUP;
  if (personnelGroupId) {
    console.log(`\n\n3. Fetching members of personnel group: ${personnelGroupId}...\n`);
    try {
      const membersResponse = await client.getGroupMembers(personnelGroupId,
        ['id', 'displayName', 'givenName', 'surname', 'jobTitle', 'mail']
      );

      console.log(`Found ${membersResponse.value?.length || 0} members:\n`);
      console.log(JSON.stringify(membersResponse.value, null, 2));
    } catch (error) {
      console.error('Error fetching group members:', error.message);
    }
  }

  // Test 4: Get first user's groups (if any users found)
  console.log('\n\n4. Fetching group memberships for first user...\n');
  try {
    const usersResponse = await client.listUsers({
      filter: "userType eq 'Member'",
      select: ['id', 'displayName'],
      top: 1,
    });

    if (usersResponse.value?.length > 0) {
      const user = usersResponse.value[0];
      console.log(`User: ${user.displayName} (${user.id})\n`);

      const groupsResponse = await client.getUserGroups(user.id);
      console.log(`Member of ${groupsResponse.value?.length || 0} groups:\n`);
      console.log(JSON.stringify(groupsResponse.value, null, 2));
    } else {
      console.log('No users found');
    }
  } catch (error) {
    console.error('Error fetching user groups:', error.message);
  }

  console.log('\n\nDone!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
