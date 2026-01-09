import { createClient } from "tinacms/dist/client";
import { queries } from "./types";
export const client = createClient({ url: 'http://localhost:7071/api/tina/gql', token: 'undefined', queries,  });
export default client;
  