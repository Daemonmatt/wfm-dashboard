import { defineEval, includes } from "@cursor/july/evals";

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "shift-edit-steps",
      description: "Uses seeded Confluence-style guidance for a shift edit question.",
      async test(t) {
        await t.send(
          "How do I log a retroactive shift edit for an employee?",
          {
            workspaceFiles: {
              "research/confluence-excerpt.md": [
                "# Logging a shift edit (admin)",
                "",
                "1. Go to Time → Timecards.",
                "2. Select the employee and pay period.",
                "3. Click **Edit shift**, adjust in/out times, add a reason.",
                "4. Save — the employee may need to approve depending on policy.",
              ].join("\n"),
            },
          }
        );
        t.succeeded();
        t.check(t.reply, includes(/timecard|shift|edit/i));
      },
    },
  ],
});
