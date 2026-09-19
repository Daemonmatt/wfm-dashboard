import { defineConnection } from "@cursor/july/connections";

export default defineConnection({
  cursorAccount: true,
  servers: ["Atlassian", "Slack"],
  advertiseTools: true,
});
