# GitHub board views

Board: https://github.com/orgs/ICS-Capstone-Team-6/projects/1

`scripts/github/board_setup.py views` creates each view below with its name, layout and filter, using the GraphQL `createProjectV2View` and `updateProjectV2View` mutations. The API cannot set grouping, sorting, field sums or visible columns' order, so finish each view by hand with the steps below. The template views that were already there (Backlog, Priority board, Team items, Roadmap, My items) were left untouched.

## How to edit a view

1. Open the board and click the view's tab.
2. Click the small arrow next to the view name to open the **View** menu.
3. Change **Layout**, **Group by**, **Sort by**, **Field sum** and **Fields** there.
4. Type filters in the filter bar at the top.
5. Click **Save** (top right). A view with unsaved changes shows a dot next to its name.

## Views

### Board

- **Layout:** Board
- **Column field:** Status (Backlog, Ready, In progress, In review, Done)
- **Filter:** `sprint:"Sprint 0"`. Change it at each sprint start to the current sprint (`/sprint-ops start N` reminds you).
- **Field sum:** Points (shows points per column)
- **Column limit:** set a limit of 8 on **In progress** (4 people, at most 2 each, Team Rules 3)
- **Fields shown on cards:** Owner, Points, Priority, Epic

### Sprint plan

- **Layout:** Table
- **Group by:** Sprint
- **Sort by:** Priority (ascending: Must, Should, Could), then Points (descending)
- **Field sum:** Points
- **Fields:** Title, Status, Owner, Points, Priority, Epic, Depends on
- **Filter:** none

### By person

- **Layout:** Table
- **Group by:** Owner
- **Slice by:** Sprint (the side panel lets you pick one sprint at a time)
- **Field sum:** Points. With a sprint slice selected, each group's sum is that person's load for the sprint. It must be 8 or less (4 in Sprint 0).
- **Sort by:** Sprint, then Priority
- **Fields:** Title, Status, Sprint, Points, Priority, Support

### Roadmap by epic

- **Layout:** Roadmap
- **Dates:** Start field **Start date**, target field **Target date** (in the view's **Date fields** menu)
- **Group by:** Epic
- **Zoom:** Month
- **Filter:** `-sprint:Icebox`
- **Markers:** add the milestones (Sprint 0 to Sprint 4) so the gate dates show

### Must only

- **Layout:** Table
- **Filter:** `priority:Must`
- **Group by:** Sprint
- **Field sum:** Points (should total 121)
- **Sort by:** Sprint, then ID (title)

### Icebox

- **Layout:** Table
- **Filter:** `sprint:Icebox`
- **Sort by:** Points (ascending)
- **Field sum:** Points (should total 50)
- **Fields:** Title, Points, Epic. The issue body holds the "Pull in when" condition.

### Blocked and decisions

- **Layout:** Table
- **Filter:** `label:"type:blocked","needs-decision"` (a comma means "either")
- **Group by:** Owner
- **Sort by:** Updated (oldest first), so the longest-waiting items are on top
- **Fields:** Title, Status, Owner, Sprint, Labels

## Status options

Status already had Backlog, Ready, In progress, In review and Done when setup ran, so it was not changed. These match the Sprint Plan columns (section 5) plus Backlog.

## Built-in workflows (optional, by hand)

In the project's **Workflows** menu, consider turning on:

- **Item added to project:** set Status to Backlog.
- **Item closed:** set Status to Done.
- **Pull request merged:** set Status to Done.
