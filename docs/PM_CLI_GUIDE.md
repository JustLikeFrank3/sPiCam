# Command Line Tools for Product Managers
## Your Secret Weapon for Sprint Management & Migration

**TL;DR:** Command line tools can automate hours of manual clicking. This guide shows you how to bulk-close stories, update sprints, and prepare for your ADO → Jira migration—all from your terminal.

---

## 📖 What Are CLI Tools?

CLI (Command Line Interface) tools let you interact with Azure DevOps and Jira using typed commands instead of clicking through web interfaces. Think of it like Excel macros, but for project management tools.

**Why should PMs care?**
- ⚡ **Speed**: Close 50 user stories in 30 seconds instead of 30 minutes
- 🔄 **Consistency**: Apply the same change to hundreds of items without mistakes
- 📊 **Reporting**: Export data for analysis that's not possible in the UI
- 🚀 **Migration**: Move work items between systems systematically

---

## 🎯 Common PM Scenarios

Before we dive into setup, here's what you can do:

### Sprint Management
- ✅ Close all "Resolved" items at sprint end
- 📋 Move unfinished work to next sprint
- 🏷️ Bulk update story points or tags
- 👤 Reassign orphaned work items

### Reporting & Analysis
- 📊 Export sprint velocity data
- 🔍 Find items missing acceptance criteria
- 📈 Generate burn-down data
- 🎯 Query complex work item relationships

### Migration Prep (ADO → Jira)
- 🧹 Clean up old/duplicate items
- 📦 Export all work items with history
- 🔗 Document dependencies
- ✅ Validate data before migration

---

## 🛠️ Setup Guide

### Option 1: Azure DevOps CLI (Current System)

**1. Install Azure CLI**
```bash
# macOS
brew install azure-cli

# Windows (PowerShell as Admin)
winget install Microsoft.AzureCLI

# Verify installation
az --version
```

**2. Install DevOps Extension**
```bash
az extension add --name azure-devops
```

**3. Login & Configure**
```bash
# Login to Azure
az login

# Set your defaults (replace with your values)
az devops configure --defaults \
  organization=https://dev.azure.com/YourOrg \
  project=YourProjectName
```

**4. Test It**
```bash
# List recent work items
az boards work-item list --top 5
```

✅ **Success!** If you see a list of work items, you're ready to go.

---

### Option 2: Jira CLI (Future System)

**1. Install Jira CLI**
```bash
# macOS
brew install go-jira

# Windows: Download from https://github.com/ankitpokhrel/jira-cli/releases
# Then add to PATH
```

**2. Configure Jira**
```bash
# Interactive setup
jira init

# You'll be prompted for:
# - Jira URL: https://yourcompany.atlassian.net
# - Email: your.email@company.com
# - API Token: (generate at https://id.atlassian.com/manage/api-tokens)
```

**3. Test It**
```bash
# List your issues
jira issue list -a $(jira me)
```

✅ **Success!** If you see your assigned issues, you're set up.

---

## 💡 Practical Examples for PMs

### Sprint Cleanup (ADO)

**Scenario:** Sprint 42 ended. You have 15 items marked "Resolved" but not formally "Closed".

**Manual way:** Open each item, click "Close", add comment, repeat 15 times (15 minutes)

**CLI way:** One command (30 seconds)
```bash
# Find and close all resolved items in current sprint
az boards query \
  --wiql "SELECT [System.Id] FROM WorkItems 
          WHERE [System.IterationPath] = '@CurrentIteration' 
          AND [System.State] = 'Resolved'" \
  --output tsv \
  --query "[].id" | \
xargs -I {} az boards work-item update --id {} \
  --state Closed \
  --discussion "Sprint 42 complete - auto-closed"
```

**Break it down:**
1. `az boards query` - Search for work items
2. `--wiql` - Use Work Item Query Language (like SQL for ADO)
3. `xargs` - Take each ID and run the update command
4. `--discussion` - Add a comment so devs know why it closed

---

### Bulk Story Point Update (ADO)

**Scenario:** After planning poker, you have 30 stories to update with new point estimates.

**Create a CSV file** (`story_points.csv`):
```csv
123,5
124,8
125,3
126,13
```

**Run the script:**
```bash
while IFS=, read -r id points; do
  echo "Updating #$id to $points points"
  az boards work-item update --id $id \
    --fields "Microsoft.VSTS.Scheduling.StoryPoints=$points"
done < story_points.csv
```

---

### Find Orphaned Work Items (ADO)

**Scenario:** You need to find all active items without an assigned owner.

```bash
# Query for unassigned active items
az boards query \
  --wiql "SELECT [System.Id], [System.Title] 
          FROM WorkItems 
          WHERE [System.AssignedTo] = '' 
          AND [System.State] = 'Active'" \
  --output table

# Optionally, assign them to the backlog owner
az boards query --wiql "..." --output tsv --query "[].id" | \
xargs -I {} az boards work-item update --id {} \
  --assigned-to backlog-owner@company.com
```

---

### Sprint Velocity Report (ADO)

**Scenario:** You need velocity data for the last 6 sprints.

```bash
# Export sprint data to JSON
for sprint in {37..42}; do
  echo "Sprint $sprint:"
  az boards query \
    --wiql "SELECT [System.Id], [Microsoft.VSTS.Scheduling.StoryPoints] 
            FROM WorkItems 
            WHERE [System.IterationPath] = 'YourProject\\Sprint $sprint' 
            AND [System.WorkItemType] = 'User Story' 
            AND [System.State] = 'Closed'" \
    --output json | \
  jq '[.[] | .fields."Microsoft.VSTS.Scheduling.StoryPoints"] | add'
done
```

**Output:**
```
Sprint 37: 42
Sprint 38: 38
Sprint 39: 45
Sprint 40: 51
Sprint 41: 47
Sprint 42: 43
```

---

## 🔄 Migration: Azure DevOps → Jira

### Phase 1: Pre-Migration Cleanup (ADO)

**1. Close stale work items**
```bash
# Find items inactive for 90+ days
az boards query \
  --wiql "SELECT [System.Id], [System.Title], [System.ChangedDate] 
          FROM WorkItems 
          WHERE [System.State] NOT IN ('Closed', 'Removed') 
          AND [System.ChangedDate] < '@Today - 90'" \
  --output table

# Review, then close them
az boards query --wiql "..." --output tsv --query "[].id" | \
xargs -I {} az boards work-item update --id {} \
  --state Removed \
  --discussion "Closed during pre-migration cleanup"
```

**2. Standardize tags**
```bash
# Find all unique tags
az boards query \
  --wiql "SELECT [System.Tags] FROM WorkItems" \
  --output json | \
jq -r '.[].fields."System.Tags"' | \
tr ';' '\n' | sort -u

# Bulk update tags (fix typos, standardize naming)
# Replace "BugFix" with "Bug-Fix"
az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'BugFix'" | \
jq -r '.[].id' | \
xargs -I {} az boards work-item update --id {} \
  --fields "System.Tags=Bug-Fix"
```

**3. Export all work items**
```bash
# Full export to JSON
az boards query \
  --wiql "SELECT * FROM WorkItems WHERE [System.TeamProject] = 'YourProject'" \
  --output json > ado_export.json

# Export with relationships
az boards work-item relation list-type
# Then include in query
```

---

### Phase 2: Migration Setup

**Option A: Official Migration Tool**
- Use **Atlassian Migration Assistant** (GUI-based)
- Works best for large organizations with complex workflows
- https://www.atlassian.com/migration/assess

**Option B: CLI-Assisted Migration**

**1. Transform ADO data to Jira format**

Create a mapping file (`ado_to_jira_mapping.json`):
```json
{
  "work_item_types": {
    "User Story": "Story",
    "Bug": "Bug",
    "Task": "Task",
    "Epic": "Epic"
  },
  "states": {
    "New": "To Do",
    "Active": "In Progress",
    "Resolved": "Done",
    "Closed": "Done"
  }
}
```

**2. Use a transformation script**

```bash
# Install jq for JSON processing
brew install jq

# Transform (example - customize for your needs)
cat ado_export.json | \
jq --slurpfile mapping ado_to_jira_mapping.json '
  map({
    project: "PROJ",
    issuetype: ($mapping[0].work_item_types[.fields."System.WorkItemType"]),
    summary: .fields."System.Title",
    description: .fields."System.Description",
    priority: (.fields."Microsoft.VSTS.Common.Priority" | tostring),
    assignee: .fields."System.AssignedTo".uniqueName,
    status: ($mapping[0].states[.fields."System.State"])
  })
' > jira_import.json
```

**3. Import to Jira**

```bash
# For each issue in jira_import.json
cat jira_import.json | jq -c '.[]' | while read issue; do
  summary=$(echo $issue | jq -r '.summary')
  echo "Creating: $summary"
  
  jira issue create \
    --type "$(echo $issue | jq -r '.issuetype')" \
    --summary "$summary" \
    --description "$(echo $issue | jq -r '.description')" \
    --assignee "$(echo $issue | jq -r '.assignee')"
done
```

---

### Phase 3: Post-Migration Validation (Jira)

**1. Verify issue count**
```bash
# ADO count
az boards query --wiql "SELECT [System.Id] FROM WorkItems" | jq 'length'

# Jira count
jira issue list --paginate 9999 | wc -l
```

**2. Check for missing issues**
```bash
# Export both systems, compare IDs
# (Custom script - ask Copilot to help generate this!)
```

---

## 🤖 Let AI Help You: Use GitHub Copilot!

**Here's the secret:** You don't need to memorize all these commands. Use **GitHub Copilot** or **ChatGPT** to generate custom scripts for your specific needs.

### How to Use Copilot for PM Tasks

**1. Install GitHub Copilot** (if you have VS Code or another supported IDE)
- https://github.com/features/copilot

**2. Describe what you want in plain English as a comment:**

```bash
# Find all user stories in Sprint 42 that have no story points assigned
# and export them to a CSV file with columns: ID, Title, Assignee

# Copilot will generate:
az boards query \
  --wiql "SELECT [System.Id], [System.Title], [System.AssignedTo] 
          FROM WorkItems 
          WHERE [System.IterationPath] CONTAINS 'Sprint 42' 
          AND [System.WorkItemType] = 'User Story' 
          AND [Microsoft.VSTS.Scheduling.StoryPoints] = ''" \
  --output json | \
jq -r '.[] | [.id, .fields."System.Title", .fields."System.AssignedTo".uniqueName] | @csv' > unpointed_stories.csv
```

**3. Ask Copilot to explain commands you don't understand:**

```bash
# What does this command do?
# xargs -I {} az boards work-item update --id {}

# Copilot explains:
# xargs: Takes input (work item IDs) and runs a command for each one
# -I {}: Replaces {} with each input value
# az boards work-item update: Updates the work item
# --id {}: Uses the ID from xargs
```

**4. Generate complex workflows:**

```bash
# I need a script that:
# 1. Finds all bugs assigned to me in the current sprint
# 2. Groups them by priority
# 3. Creates a summary report with counts
# 4. Emails the report to my manager

# Copilot will generate a complete bash script!
```

---

## 📚 Quick Reference Commands

### Azure DevOps CLI Cheat Sheet

```bash
# List projects
az devops project list

# List work items
az boards work-item list --top 20

# Show specific work item
az boards work-item show --id 123

# Create work item
az boards work-item create \
  --type "User Story" \
  --title "New feature request" \
  --assigned-to me@company.com

# Update work item
az boards work-item update --id 123 \
  --state Active \
  --assigned-to dev@company.com

# Query work items
az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"

# List iterations (sprints)
az boards iteration project list

# Set work item iteration
az boards work-item update --id 123 \
  --iteration "Sprint 43"
```

### Jira CLI Cheat Sheet

```bash
# List your issues
jira issue list

# View specific issue
jira issue view PROJ-123

# Create issue
jira issue create \
  --type Story \
  --summary "New feature" \
  --description "Detailed description"

# Update issue
jira issue move PROJ-123 "In Progress"

# Assign issue
jira issue assign PROJ-123 $(jira me)

# Add comment
jira issue comment add PROJ-123 "Working on this now"

# List sprints
jira sprint list

# Move to sprint
jira issue move PROJ-123 --sprint "Sprint 43"
```

---

## 🚀 Getting Started: Your First Script

Let's create a simple, practical script together.

**Goal:** Close all resolved items in the current sprint.

**Save this as** `close-sprint.sh`:

```bash
#!/bin/bash

# Close Sprint Script - Closes all resolved items in current sprint
# Usage: ./close-sprint.sh

echo "🔍 Finding resolved items in current sprint..."

# Get list of resolved items
items=$(az boards query \
  --wiql "SELECT [System.Id], [System.Title] 
          FROM WorkItems 
          WHERE [System.IterationPath] = '@CurrentIteration' 
          AND [System.State] = 'Resolved'" \
  --output tsv \
  --query "[][id,fields.'System.Title']")

# Check if any items found
if [ -z "$items" ]; then
  echo "✅ No resolved items found. Sprint is clean!"
  exit 0
fi

# Show what will be closed
echo ""
echo "📋 Items to close:"
echo "$items" | while IFS=$'\t' read -r id title; do
  echo "  #$id: $title"
done

# Confirm with user
echo ""
read -p "Close these items? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "🔄 Closing items..."
  
  echo "$items" | while IFS=$'\t' read -r id title; do
    az boards work-item update --id $id \
      --state Closed \
      --discussion "Auto-closed via close-sprint.sh" \
      > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
      echo "  ✅ Closed #$id"
    else
      echo "  ❌ Failed to close #$id"
    fi
  done
  
  echo ""
  echo "🎉 Sprint closure complete!"
else
  echo "Cancelled. No items were closed."
fi
```

**Make it executable:**
```bash
chmod +x close-sprint.sh
```

**Run it:**
```bash
./close-sprint.sh
```

---

## 💬 Ask Copilot to Customize This Script

Open the script in VS Code with Copilot enabled and try these prompts:

1. **"Add logging to a file"**
   - Copilot will add: `| tee sprint_closure_$(date +%Y%m%d).log`

2. **"Only close items that have been resolved for more than 2 days"**
   - Copilot will add date filtering to the WIQL query

3. **"Send me an email with the results"**
   - Copilot will add mail command integration

4. **"Add error handling and retry logic"**
   - Copilot will wrap updates in try-catch with retries

Just type your request as a comment, and Copilot will generate the code!

---

## 📖 Learning Resources

### Azure DevOps CLI
- **Official Docs:** https://learn.microsoft.com/en-us/azure/devops/cli/
- **WIQL Reference:** https://learn.microsoft.com/en-us/azure/devops/boards/queries/wiql-syntax
- **Examples:** https://github.com/Azure/azure-devops-cli-extension

### Jira CLI
- **go-jira (recommended):** https://github.com/go-jira/jira
- **jira-cli (modern):** https://github.com/ankitpokhrel/jira-cli
- **JQL Guide:** https://www.atlassian.com/software/jira/guides/expand-jira/jql

### General CLI Skills
- **CLI Basics:** https://missing.csail.mit.edu/
- **Bash Scripting:** https://www.shellscript.sh/
- **jq (JSON processor):** https://stedolan.github.io/jq/tutorial/

---

## 🎯 Next Steps

1. **Install the CLIs** (15 minutes)
   - Follow setup guides above for ADO and/or Jira

2. **Try one command** (5 minutes)
   - Run: `az boards work-item list --top 5`
   - Success means you're ready to go!

3. **Run the close-sprint script** (10 minutes)
   - Copy the script from this guide
   - Test it on your next sprint closure

4. **Ask Copilot for help** (ongoing)
   - Start with: "Write a bash script to [your specific need]"
   - Iterate until it works perfectly

5. **Share with your team**
   - Show devs how you closed 50 items in 30 seconds
   - They'll be impressed (and maybe adopt CLI tools too!)

---

## ❓ Common Questions

**Q: Do I need to learn programming?**
A: No! Copy-paste the examples, and use Copilot to customize them. Start simple.

**Q: What if I break something?**
A: Most commands only affect what you specify. Always run queries with `--output table` first to preview. Work items have history, so changes can be reverted.

**Q: Can I undo changes made via CLI?**
A: Yes, ADO and Jira both track full history. You can manually revert, or write a script to reverse changes.

**Q: How long does migration take?**
A: Small projects (< 1000 items): 1-2 weeks. Medium (1000-5000): 1-2 months. Large (5000+): 3-6 months with Atlassian Migration Assistant.

**Q: Will this replace the web UI?**
A: No, it complements it. Use the UI for daily work, CLI for bulk operations.

**Q: What about security?**
A: CLI uses the same authentication as the web UI. Your credentials are stored securely in your system's credential manager.

---

## 🎉 You're Ready!

You now have everything you need to:
- ⚡ Automate repetitive PM tasks
- 🔄 Prepare for your ADO → Jira migration
- 🤖 Use AI to generate custom scripts
- 📊 Generate reports that aren't possible in the UI

**Remember:** Start small, use Copilot liberally, and don't be afraid to experiment. The CLI is your friend!

---

**Questions or need custom scripts?** Ask GitHub Copilot or ChatGPT:
- "How do I [specific task] using Azure DevOps CLI?"
- "Write me a bash script that [detailed requirement]"
- "Explain this command: [paste command]"

Happy automating! 🚀

---

*Created by: A friend who wants to save you from death-by-clicking*  
*Last Updated: February 13, 2026*
