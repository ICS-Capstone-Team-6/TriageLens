#!/usr/bin/env python3
"""Turn docs/planning/product_backlog.csv into GitHub labels, milestones,
issues and a configured GitHub Project.

Idempotent and resumable: every step reads what exists first and only
creates what is missing. Issues are matched by their "[E#-##]" title prefix.
Never deletes or renames anything.

Usage:
  python3 scripts/github/board_setup.py <step> [--dry-run]

Steps (run in order; 00_run_all.sh runs them all):
  validate   check CSV totals (read-only)
  project    set project title, description and README; link the repo
  labels     create missing labels
  milestones create missing milestones "Sprint 0" to "Sprint 4"
  fields     create missing project fields and add missing select options
  issues     create missing issues (first pass)
  deps       rewrite "Depends on" lines with #issue links (second pass)
  assign     add assignees for owners who are now assignable
  items      add issues to the project and set field values
  views      create missing project views (name, layout, filter only)
  verify     reconciliation report (read-only)
  export     write docs/sprints/board-snapshot-YYYY-MM-DD.csv (read-only)

Environment: GH_SLEEP (seconds between writes, default 1.0).
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / "scripts" / "github"
CSV_PATH = ROOT / "docs" / "planning" / "product_backlog.csv"
SPRINT_PLAN = ROOT / "docs" / "planning" / "03_Sprint_Plan.md"
TEAM_RULES = ROOT / "docs" / "planning" / "04_Team_Rules_and_Requirements.md"
LOG = HERE / "setup.log"
MAP = HERE / "issue-map.json"

OWNER = "ICS-Capstone-Team-6"
REPO = f"{OWNER}/TriageLens"
PROJECT_NUMBER = 1
PROJECT_TITLE = "TriageLens"  # kept as-is (user decision, 16 Oct 2026)
PROJECT_DESC = "Nine-week capstone board: AI triage PWA for TB, pneumonia and DR at district clinics. Source: docs/planning/product_backlog.csv"
BLOB = f"https://github.com/{REPO}/blob/main"
SLEEP = float(os.environ.get("GH_SLEEP", "1.0"))
DRY = "--dry-run" in sys.argv

USERNAMES = {"Kweku": "kaanyen", "Nana Yaw": "Korantengnator",
             "Chelsea": "Chelsea-Owusu-Pokuaah", "Micheal": "Michael-Sylvester"}
PEOPLE = ["Kweku", "Chelsea", "Nana Yaw", "Micheal"]

SPRINTS = OrderedDict([
    ("Sprint 0", ("2026-10-19", "2026-10-23")),
    ("Sprint 1", ("2026-10-26", "2026-11-06")),
    ("Sprint 2", ("2026-11-09", "2026-11-20")),
    ("Sprint 3", ("2026-11-23", "2026-12-03")),
    ("Sprint 4", ("2026-12-07", "2026-12-18")),
])
EXPECT = {"rows": 73, "stories": 63, "icebox": 10, "icebox_points": 50,
          "by_sprint": {"Sprint 0": 16, "Sprint 1": 32, "Sprint 2": 32, "Sprint 3": 32, "Sprint 4": 32}}

EPIC_SHORT = OrderedDict([
    ("E0", "Setup and Governance"), ("E1", "Data"), ("E2", "Chest X-ray Models"),
    ("E3", "Retinal Model"), ("E4", "Quality Gate"), ("E5", "On-Device Inference"),
    ("E6", "Calibration and Explainability"), ("E7", "Phone-Photo Robustness"),
    ("E8", "App and UX"), ("E9", "Backend and Sync"), ("E10", "Review and Admin"),
    ("E11", "Validation"), ("E12", "Ethics and Safety"), ("E13", "DevOps and QA"),
    ("E14", "Delivery"), ("E15", "Stretch"),
])
ML_EPICS = {"E1", "E2", "E3", "E6", "E7", "E11"}
CUT_ORDER = ["E10-02", "E8-09", "E9-04", "E13-03", "E6-03", "E8-07", "E10-01", "E6-02", "E0-06"]

LABELS = OrderedDict()
LABELS["priority:must"] = ("b60205", "Must: defines the MVP (Backlog 1)")
LABELS["priority:should"] = ("fbca04", "Should: planned, cut first if behind (Backlog 2.3)")
LABELS["priority:could"] = ("c5def5", "Could: icebox stretch idea")
for k, v in EPIC_SHORT.items():
    LABELS[f"epic:{k} {v}"] = ("5319e7" if k != "E15" else "d4c5f9", f"Epic {k}")
LABELS["type:story"] = ("1d76db", "Backlog story")
LABELS["type:spike"] = ("0e8a16", "Time-boxed spike: one day, ends in an ADR")
LABELS["type:bug"] = ("d73a4a", "Something is broken")
LABELS["type:docs"] = ("0075ca", "Documentation or report work")
LABELS["type:ml"] = ("006b75", "Machine learning: data, models, evaluation")
LABELS["type:safety"] = ("e99695", "Clinical safety, ethics or compliance")
LABELS["type:blocked"] = ("000000", "Blocked: see comment for the blocker")
LABELS["needs-decision"] = ("f9d0c4", "Waiting on a team decision (TRD 4.6 or an ADR)")
LABELS["scope-change"] = ("fef2c0", "Added or moved under the swap rule (Team Rules 12)")
LABELS["cut-candidate"] = ("bfd4f2", "Should story in the cut order (Backlog 2.3)")

STATUS_OPTIONS = ["Backlog", "Ready", "In progress", "In review", "Done"]
NEW_FIELDS = OrderedDict([
    ("Sprint", ("SINGLE_SELECT", list(SPRINTS) + ["Icebox"])),
    ("Points", ("NUMBER", None)),
    ("Epic", ("SINGLE_SELECT", [f"{k} {v}" for k, v in EPIC_SHORT.items()])),
    ("Owner", ("SINGLE_SELECT", PEOPLE)),
    ("MoSCoW", ("SINGLE_SELECT", ["Must", "Should", "Could"])),
    ("Support", ("TEXT", None)),
    ("Depends on", ("TEXT", None)),
    ("Requirement", ("TEXT", None)),
])
# The template's "Priority", "Start date" and "Target date" are org-wide issue fields, not project
# fields: the project API cannot change them. MoSCoW gets its own project field (user decision,
# 16 Oct 2026); sprint dates are written to the org date fields on each issue with setIssueFieldValue.
SELECT_OPTIONS: dict[str, list[str]] = {}
START_FIELD, TARGET_FIELD = "Start date", "Target date"  # org issue fields (IssueFieldDate)

VIEWS = [
    ("Board", "BOARD_LAYOUT", 'sprint:"Sprint 0"'),
    ("Sprint plan", "TABLE_LAYOUT", ""),
    ("By person", "TABLE_LAYOUT", ""),
    ("Roadmap by epic", "ROADMAP_LAYOUT", "-sprint:Icebox"),
    ("Must only", "TABLE_LAYOUT", "moscow:Must"),
    ("Icebox", "TABLE_LAYOUT", "sprint:Icebox"),
    ("Blocked and decisions", "TABLE_LAYOUT", 'label:"type:blocked","needs-decision"'),
]

counts: Counter = Counter()


# ---------- helpers ----------

def log(msg: str) -> None:
    line = f"{dt.datetime.now().isoformat(timespec='seconds')} {'DRY ' if DRY else ''}{msg}"
    print(line)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def gh(args: list[str], write: bool = False, stdin: str | None = None) -> str:
    """Run gh. Writes are skipped in dry-run, throttled and retried with backoff."""
    if write and DRY:
        counts["planned writes"] += 1
        return ""
    delay = 30
    for attempt in range(6):
        p = subprocess.run(["gh", *args], capture_output=True, text=True, input=stdin)
        if p.returncode == 0:
            if write:
                counts["writes"] += 1
                time.sleep(SLEEP)
            return p.stdout
        err = p.stderr.lower()
        if any(s in err for s in ("rate limit", "secondary", "abuse", "502", "503", "timeout")):
            log(f"rate limit or server error, waiting {delay}s (attempt {attempt + 1}): {p.stderr.strip()[:200]}")
            time.sleep(delay)
            delay *= 2
            continue
        raise RuntimeError(f"gh {' '.join(args[:4])}... failed: {p.stderr.strip()}")
    raise RuntimeError("gave up after repeated rate-limit errors")


def graphql(query: str, write: bool = False, **variables) -> dict:
    args = ["api", "graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        args += ["-F" if isinstance(v, int) else "-f", f"{k}={v}"]
    out = gh(args, write=write)
    return json.loads(out) if out else {}


def rows() -> list[dict]:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def is_icebox(r: dict) -> bool:
    return r["Sprint"] == "Unscheduled"


def epic_key(r: dict) -> str:
    return r["ID"].split("-")[0]


def title(r: dict) -> str:
    return f"[{r['ID']}] {r['Story']}"


def project() -> dict:
    q = """query($o:String!,$n:Int!){organization(login:$o){projectV2(number:$n){id title url
      fields(first:50){nodes{... on ProjectV2FieldCommon{id name dataType}
      ... on ProjectV2SingleSelectField{options{id name color description}}}}
      views(first:50){nodes{id name layout}}
      repositories(first:20){nodes{nameWithOwner}}}}}"""
    return graphql(q, o=OWNER, n=PROJECT_NUMBER)["data"]["organization"]["projectV2"]


def fields_by_name(p: dict) -> dict:
    return {f["name"]: f for f in p["fields"]["nodes"] if f}


def existing_issues() -> dict[str, dict]:
    out = gh(["issue", "list", "--repo", REPO, "--state", "all", "--limit", "500",
              "--json", "id,number,title,url,state,assignees,body"])
    found: dict[str, dict] = {}
    for i in json.loads(out):
        m = re.match(r"\[(E\d+-\d+)\]", i["title"])
        if m:
            if m.group(1) in found:
                log(f"WARNING duplicate issues for {m.group(1)}: #{found[m.group(1)]['number']} and #{i['number']}")
            found.setdefault(m.group(1), i)
    return found


def save_map(issues: dict[str, dict]) -> None:
    data = {k: issues[k]["number"] for k in sorted(issues, key=lambda s: (int(s[1:].split('-')[0]), int(s.split('-')[1])))}
    if not DRY:
        MAP.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def sprint_sections() -> dict[str, dict]:
    text = SPRINT_PLAN.read_text(encoding="utf-8")
    out = {}
    parts = re.split(r"^## 3\.\d (Sprint \d): .+$", text, flags=re.M)
    for i in range(1, len(parts), 2):
        body = parts[i + 1].split("\n# ")[0]
        out[parts[i]] = {
            "goal": re.search(r"\*\*Goal\.\*\* (.+)", body).group(1),
            "gate": re.search(r"\*\*(Gate G\d .+?)\. Exit criteria:\*\*", body).group(1),
            "criteria": re.search(r"Exit criteria:\*\*\n\n((?:- .+\n)+)", body).group(1).strip(),
        }
    return out


def definition_of_done() -> list[str]:
    text = TEAM_RULES.read_text(encoding="utf-8")
    sec = text.split("## 5.2 Definition of Done")[1].split("\n## ")[0]
    return [re.sub(r"^\d+\.\s*", "", l).strip() for l in sec.splitlines() if re.match(r"^\d+\.", l)]


TRD_SECTION = [("FR-", "TRD 7.1"), ("NFR-", "TRD 8"), ("ML-DATA", "TRD 9.2"), ("ML-TRAIN", "TRD 9.3 to 9.5"),
               ("ML-CALIB", "TRD 9.6"), ("ML-ROBUST", "TRD 9.7"), ("ML-EVAL", "TRD 9.8"), ("ML-FAIR", "TRD 9.9")]


def labels_for(r: dict) -> list[str]:
    k = epic_key(r)
    out = [f"priority:{r['Priority'].lower()}", f"epic:{k} {EPIC_SHORT[k]}"]
    out.append("type:spike" if r["Story"].startswith("Spike:") else "type:story")
    if k in ML_EPICS:
        out.append("type:ml")
    if k == "E12":
        out.append("type:safety")
    if k == "E14":
        out.append("type:docs")
    if r["ID"] in CUT_ORDER:
        out.append("cut-candidate")
    return out


def depends_text(r: dict, issues: dict[str, dict] | None) -> str:
    dep = r["Depends on"].strip()
    if not dep:
        return "none"
    if not issues:
        return dep
    return re.sub(r"E\d+-\d+", lambda m: f"{m.group(0)} (#{issues[m.group(0)]['number']})" if m.group(0) in issues else m.group(0), dep)


def body_for(r: dict, issues: dict[str, dict] | None = None) -> str:
    k = epic_key(r)
    reqs = r["Requirement"].strip() or "-"
    secs = sorted({s for pre, s in TRD_SECTION for q in reqs.split(", ") if q.startswith(pre)})
    if is_icebox(r):
        sprint = "Icebox (unscheduled)"
    else:
        a, b = SPRINTS[r["Sprint"]]
        sprint = f"{r['Sprint']} ({a} to {b})"
    lines = [
        f"**Epic:** {k} {r['Epic']}",
        f"**Requirement IDs:** {reqs}",
        f"**Priority:** {r['Priority']}",
        f"**Points:** {r['Points']}",
        f"**Sprint:** {sprint}",
        f"**Owner:** {r['Owner'] or 'unassigned (icebox)'}  **Support:** {r['Support'] or 'none'}",
        f"**Depends on:** {depends_text(r, issues)}",
        "",
    ]
    if is_icebox(r):
        lines += ["### Pull in when", "", r["Acceptance criteria"], ""]
    else:
        lines += ["### Acceptance criteria", ""]
        lines += [f"- [ ] {c.strip()}" for c in r["Acceptance criteria"].split(";") if c.strip()]
        lines += ["", "### Definition of Done (Team Rules 5.2)", ""]
        lines += [f"- [ ] {d}" for d in definition_of_done()]
        lines.append("")
    lines += ["### References", ""]
    if secs:
        lines.append(f"- [TRD]({BLOB}/docs/planning/01_TRD.md): {', '.join(secs)}")
    lines.append(f"- [Product Backlog]({BLOB}/docs/planning/02_Product_Backlog.md): "
                 + ("section 4 (Icebox)" if is_icebox(r) else f"section 3, {k}"))
    if not is_icebox(r):
        lines.append(f"- [Sprint Plan]({BLOB}/docs/planning/03_Sprint_Plan.md): {r['Sprint']}")
    lines += ["", "---", "Source: docs/planning/product_backlog.csv (baseline v1.0)"]
    return "\n".join(lines)


# ---------- steps ----------

def step_validate() -> None:
    rs = rows()
    ice = [r for r in rs if is_icebox(r)]
    st = [r for r in rs if not is_icebox(r)]
    by = {s: sum(int(r["Points"]) for r in st if r["Sprint"] == s) for s in SPRINTS}
    got = {"rows": len(rs), "stories": len(st), "icebox": len(ice),
           "icebox_points": sum(int(r["Points"]) for r in ice), "by_sprint": by}
    log(f"validate: {got}")
    if got != EXPECT:
        raise SystemExit(f"CSV totals differ from the expected baseline: expected {EXPECT}")
    dup = [k for k, v in Counter(r["ID"] for r in rs).items() if v > 1]
    if dup:
        raise SystemExit(f"duplicate IDs: {dup}")
    log("validate: OK (73 rows, 144 committed points 16/32/32/32/32, 50 icebox points)")


def step_project() -> None:
    p = project()
    if p["title"] != PROJECT_TITLE:
        log(f"project: set title '{p['title']}' -> '{PROJECT_TITLE}' and description and README")
    else:
        log("project: title already set; refreshing description and README")
    readme = (HERE / "project-readme.md").read_text(encoding="utf-8")
    gh(["project", "edit", str(PROJECT_NUMBER), "--owner", OWNER, "--title", PROJECT_TITLE,
        "--description", PROJECT_DESC, "--readme", readme], write=True)
    linked = [n["nameWithOwner"] for n in p["repositories"]["nodes"]]
    if REPO in linked:
        log(f"project: already linked to {REPO}")
    else:
        log(f"project: link to {REPO}")
        gh(["project", "link", str(PROJECT_NUMBER), "--owner", OWNER, "--repo", REPO], write=True)


def step_labels() -> None:
    have = {l["name"] for l in json.loads(gh(["label", "list", "--repo", REPO, "--limit", "300", "--json", "name"]))}
    missing = [n for n in LABELS if n not in have]
    log(f"labels: {len(LABELS) - len(missing)} exist, {len(missing)} to create")
    for n in missing:
        color, desc = LABELS[n]
        log(f"labels: create '{n}'")
        gh(["label", "create", n, "--repo", REPO, "--color", color, "--description", desc], write=True)


def step_milestones() -> None:
    have = {m["title"] for m in json.loads(gh(["api", f"repos/{REPO}/milestones?state=all&per_page=100"]))}
    secs = sprint_sections()
    for s, (_, end) in SPRINTS.items():
        if s in have:
            log(f"milestones: '{s}' exists")
            continue
        d = secs[s]
        desc = f"Goal: {d['goal']}\n\n{d['gate']}. Exit criteria:\n{d['criteria']}\n\nSource: docs/planning/03_Sprint_Plan.md"
        log(f"milestones: create '{s}' due {end}")
        gh(["api", f"repos/{REPO}/milestones", "-X", "POST", "-f", f"title={s}", "-f", f"due_on={end}T12:00:00Z",
            "-f", f"description={desc}"], write=True)


def step_fields() -> None:
    p = project()
    have = fields_by_name(p)
    for name, (dtype, opts) in NEW_FIELDS.items():
        if name in have:
            if have[name]["dataType"] != dtype:
                raise SystemExit(f"field '{name}' exists with type {have[name]['dataType']}, expected {dtype}. Resolve by hand.")
            log(f"fields: '{name}' exists")
            continue
        log(f"fields: create '{name}' ({dtype}{': ' + ', '.join(opts) if opts else ''})")
        args = ["project", "field-create", str(PROJECT_NUMBER), "--owner", OWNER, "--name", name, "--data-type", dtype]
        if opts:
            args += ["--single-select-options", ",".join(opts)]
        gh(args, write=True)
    org_fields = issue_fields()
    for name in (START_FIELD, TARGET_FIELD):
        if org_fields.get(name, {}).get("__typename") != "IssueFieldDate":
            raise SystemExit(f"expected an org issue date field '{name}'")
    # Add missing options to existing single-select fields, keeping existing options and their IDs.
    for name, wanted in [*SELECT_OPTIONS.items(), ("Status", STATUS_OPTIONS)]:
        f = have.get(name)
        if not f:
            raise SystemExit(f"expected an existing field '{name}'")
        existing = f.get("options") or []
        names = [o["name"] for o in existing]
        missing = [o for o in wanted if o not in names]
        if not missing:
            log(f"fields: '{name}' options complete ({', '.join(names)})")
            continue
        log(f"fields: add options to '{name}': {', '.join(missing)}")
        opts = [{"id": o["id"], "name": o["name"], "color": o["color"], "description": o.get("description") or ""} for o in existing]
        opts += [{"name": o, "color": "GRAY", "description": ""} for o in missing]
        opt_gql = ",".join("{" + (f'id:{json.dumps(o["id"])},' if "id" in o else "")
                           + f'name:{json.dumps(o["name"])},color:{o["color"]},description:{json.dumps(o["description"])}' + "}" for o in opts)
        graphql(f'mutation{{updateProjectV2Field(input:{{fieldId:{json.dumps(f["id"])},singleSelectOptions:[{opt_gql}]}}){{projectV2Field{{... on ProjectV2SingleSelectField{{name}}}}}}}}', write=True)


def step_issues() -> None:
    rs = rows()
    issues = existing_issues()
    assignable = assignable_users()
    todo = [r for r in rs if r["ID"] not in issues]
    log(f"issues: {len(issues)} exist, {len(todo)} to create")
    for r in todo:
        args = ["issue", "create", "--repo", REPO, "--title", title(r), "--body-file", "-"]
        for l in labels_for(r):
            args += ["--label", l]
        if not is_icebox(r):
            args += ["--milestone", r["Sprint"]]
        user = USERNAMES.get(r["Owner"])
        if user and user in assignable:
            args += ["--assignee", user]
        log(f"issues: create {title(r)[:70]} labels={labels_for(r)} milestone={'-' if is_icebox(r) else r['Sprint']} assignee={user if user in assignable else '-'}")
        out = gh(args, write=True, stdin=body_for(r))
        if out:
            n = int(out.strip().rstrip("/").split("/")[-1])
            issues[r["ID"]] = {"number": n, "url": out.strip()}
    save_map(issues)


def step_deps() -> None:
    rs = rows()
    issues = existing_issues()
    for r in rs:
        if r["ID"] not in issues or not re.search(r"E\d+-\d+", r["Depends on"]):
            continue
        want = f"**Depends on:** {depends_text(r, issues)}"
        body = issues[r["ID"]].get("body") or ""
        if want in body:
            continue
        new = re.sub(r"^\*\*Depends on:\*\* .*$", want, body, count=1, flags=re.M)
        log(f"deps: {r['ID']} #{issues[r['ID']]['number']} -> {want}")
        gh(["issue", "edit", str(issues[r["ID"]]["number"]), "--repo", REPO, "--body-file", "-"], write=True, stdin=new)
    save_map(issues)


def assignable_users() -> set[str]:
    q = 'query($o:String!,$r:String!){repository(owner:$o,name:$r){assignableUsers(first:100){nodes{login}}}}'
    d = graphql(q, o=OWNER, r=REPO.split("/")[1])
    return {n["login"] for n in d["data"]["repository"]["assignableUsers"]["nodes"]}


def step_assign() -> None:
    issues = existing_issues()
    ok = assignable_users()
    for r in rows():
        user = USERNAMES.get(r["Owner"])
        i = issues.get(r["ID"])
        if not user or not i:
            continue
        if user not in ok:
            counts[f"not assignable: {user}"] += 1
            continue
        if user in [a["login"] for a in i.get("assignees", [])]:
            continue
        log(f"assign: {r['ID']} #{i['number']} -> {user}")
        gh(["issue", "edit", str(i["number"]), "--repo", REPO, "--add-assignee", user], write=True)
    for k, v in counts.items():
        if k.startswith("not assignable"):
            log(f"assign: {k} ({v} issues skipped; re-run after they accept the repo invite)")


def issue_fields() -> dict[str, dict]:
    q = """query($o:String!){organization(login:$o){issueFields(first:50){nodes{__typename
      ... on IssueFieldDate{id name} ... on IssueFieldSingleSelect{id name} ... on IssueFieldText{id name}
      ... on IssueFieldNumber{id name}}}}}"""
    return {n["name"]: n for n in graphql(q, o=OWNER)["data"]["organization"]["issueFields"]["nodes"] if n.get("name")}


def project_items(p: dict) -> dict[int, str]:
    out = {}
    cursor = None
    while True:
        q = """query($id:ID!,$c:String){node(id:$id){... on ProjectV2{items(first:100,after:$c){
          pageInfo{hasNextPage endCursor} nodes{id content{... on Issue{number repository{nameWithOwner}}}}}}}}"""
        args = {"id": p["id"]}
        if cursor:
            args["c"] = cursor
        d = graphql(q, **args)["data"]["node"]["items"]
        for n in d["nodes"]:
            c = n.get("content") or {}
            if c.get("repository", {}).get("nameWithOwner") == REPO:
                out[c["number"]] = n["id"]
        if not d["pageInfo"]["hasNextPage"]:
            return out
        cursor = d["pageInfo"]["endCursor"]


def step_items() -> None:
    p = project()
    f = fields_by_name(p)
    issues = existing_issues()
    items = project_items(p)
    org = issue_fields()
    opt = lambda field, name: next(o["id"] for o in f[field]["options"] if o["name"] == name) if not DRY or field in f and f[field].get("options") else "DRY"
    for r in rows():
        i = issues.get(r["ID"])
        if not i:
            log(f"items: {r['ID']} has no issue yet; run the issues step first")
            continue
        item = items.get(i["number"])
        if not item:
            log(f"items: add #{i['number']} {r['ID']} to project")
            out = gh(["project", "item-add", str(PROJECT_NUMBER), "--owner", OWNER,
                      "--url", f"https://github.com/{REPO}/issues/{i['number']}", "--format", "json"], write=True)
            item = json.loads(out)["id"] if out else "DRY"
        values = [
            ("Sprint", "single", "Icebox" if is_icebox(r) else r["Sprint"]),
            ("Points", "number", int(r["Points"])),
            ("MoSCoW", "single", r["Priority"]),
            ("Epic", "single", f"{epic_key(r)} {EPIC_SHORT[epic_key(r)]}"),
            ("Support", "text", r["Support"]),
            ("Depends on", "text", r["Depends on"]),
            ("Requirement", "text", r["Requirement"]),
            ("Status", "single", "Backlog"),
        ]
        if r["Owner"]:
            values.append(("Owner", "single", r["Owner"]))
        values = [v for v in values if v[2] not in ("", None)]
        dates = [] if is_icebox(r) else list(zip((START_FIELD, TARGET_FIELD), SPRINTS[r["Sprint"]]))
        log(f"items: set {len(values)} fields on #{i['number']} {r['ID']}: " + ", ".join(f"{n}={v}" for n, _, v in values) + "".join(f", {n}={v} (issue field)" for n, v in dates))
        if DRY:
            counts["planned writes"] += 1
            continue
        parts = []
        for idx, (name, kind, val) in enumerate(values):
            if kind == "single":
                v = f"{{singleSelectOptionId:{json.dumps(opt(name, val))}}}"
            elif kind == "number":
                v = f"{{number:{val}}}"
            elif kind == "date":
                v = f"{{date:{json.dumps(val)}}}"
            else:
                v = f"{{text:{json.dumps(val)}}}"
            parts.append(f'f{idx}:updateProjectV2ItemFieldValue(input:{{projectId:{json.dumps(p["id"])},itemId:{json.dumps(item)},'
                         f'fieldId:{json.dumps(f[name]["id"])},value:{v}}}){{clientMutationId}}')
        if dates:
            vals = ",".join(f'{{fieldId:{json.dumps(org[n]["id"])},dateValue:{json.dumps(v)}}}' for n, v in dates)
            parts.append(f'd0:setIssueFieldValue(input:{{issueId:{json.dumps(i["id"])},issueFields:[{vals}]}}){{clientMutationId}}')
        graphql("mutation{" + " ".join(parts) + "}", write=True)
        time.sleep(SLEEP)  # each batch holds several mutations; give the API extra room


def step_views() -> None:
    p = project()
    have = {v["name"] for v in p["views"]["nodes"]}
    for name, layout, flt in VIEWS:
        if name in have:
            log(f"views: '{name}' exists")
            continue
        log(f"views: create '{name}' ({layout}) filter='{flt}'")
        d = graphql(f'mutation{{createProjectV2View(input:{{projectId:{json.dumps(p["id"])},name:{json.dumps(name)},layout:{layout}}}){{projectV2View{{id}}}}}}', write=True)
        if flt and d:
            vid = d["data"]["createProjectV2View"]["projectV2View"]["id"]
            graphql(f'mutation{{updateProjectV2View(input:{{viewId:{json.dumps(vid)},filter:{json.dumps(flt)}}}){{projectV2View{{id}}}}}}', write=True)


def board_rows(p: dict) -> list[dict]:
    q = """query($id:ID!,$c:String){node(id:$id){... on ProjectV2{items(first:100,after:$c){pageInfo{hasNextPage endCursor}
      nodes{content{... on Issue{number title state repository{nameWithOwner}}}
      fieldValues(first:30){nodes{
        ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{name}}}
        ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2FieldCommon{name}}}
        ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{name}}}
        ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2FieldCommon{name}}}}}}}}}}"""
    out, cursor = [], None
    while True:
        args = {"id": p["id"]}
        if cursor:
            args["c"] = cursor
        d = graphql(q, **args)["data"]["node"]["items"]
        for n in d["nodes"]:
            c = n.get("content") or {}
            if not c.get("title"):
                continue
            row = {"number": c["number"], "title": c["title"], "state": c["state"]}
            for v in n["fieldValues"]["nodes"]:
                if v and v.get("field"):
                    row[v["field"]["name"]] = v.get("name") or v.get("number") or v.get("text") or v.get("date")
            out.append(row)
        if not d["pageInfo"]["hasNextPage"]:
            return out
        cursor = d["pageInfo"]["endCursor"]


def step_verify() -> None:
    rs = rows()
    issues = existing_issues()
    p = project()
    board = {b["number"]: b for b in board_rows(p)}
    problems = []
    print(f"\n{'Sprint':<10}{'CSV pts':>8}{'Board pts':>10}{'CSV n':>7}{'Issues':>8}{'On board':>9}")
    for s in [*SPRINTS, "Icebox"]:
        sel = [r for r in rs if (("Icebox" if is_icebox(r) else r["Sprint"]) == s)]
        nums = [issues[r["ID"]]["number"] for r in sel if r["ID"] in issues]
        bp = sum(int(board[n].get("Points") or 0) for n in nums if n in board and board[n].get("Sprint") == s)
        print(f"{s:<10}{sum(int(r['Points']) for r in sel):>8}{bp:>10}{len(sel):>7}{len(nums):>8}{sum(1 for n in nums if n in board):>9}")
    for r in rs:
        i = issues.get(r["ID"])
        if not i:
            problems.append(f"{r['ID']}: no issue")
            continue
        b = board.get(i["number"])
        if not b:
            problems.append(f"{r['ID']} #{i['number']}: not on board")
            continue
        want = {"Sprint": "Icebox" if is_icebox(r) else r["Sprint"], "Points": float(r["Points"]),
                "MoSCoW": r["Priority"], "Epic": f"{epic_key(r)} {EPIC_SHORT[epic_key(r)]}"}
        if r["Owner"]:
            want["Owner"] = r["Owner"]
        for k, v in want.items():
            got = b.get(k)
            if (float(got) if k == "Points" and got is not None else got) != v:
                problems.append(f"{r['ID']} #{i['number']}: {k} is {got!r}, expected {v!r}")
        if b["title"] != title(r):
            problems.append(f"{r['ID']} #{i['number']}: title differs")
    print(f"\nIssues: {len(issues)} / {len(rs)}; board items from this repo: {len(board)}")
    print("Problems:" if problems else "No problems found.")
    for x in problems:
        print("  " + x)


def step_export() -> None:
    p = project()
    issues = existing_issues()
    by_num = {v["number"]: k for k, v in issues.items()}
    out = ROOT / "docs" / "sprints" / f"board-snapshot-{dt.date.today().isoformat()}.csv"
    cols = ["ID", "Title", "Status", "Sprint", "Points", "MoSCoW", "Epic", "Owner", "Support", "Depends on", "Issue number", "Issue state"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for b in sorted(board_rows(p), key=lambda b: b["number"]):
            w.writerow([by_num.get(b["number"], ""), b["title"], b.get("Status", ""), b.get("Sprint", ""),
                        (int(b["Points"]) if isinstance(b.get("Points"), float) and b["Points"].is_integer() else b.get("Points", "")), b.get("MoSCoW", ""), b.get("Epic", ""), b.get("Owner", ""),
                        b.get("Support", ""), b.get("Depends on", ""), b["number"], b["state"]])
    print(f"wrote {out.relative_to(ROOT)}")


STEPS = OrderedDict([("validate", step_validate), ("project", step_project), ("labels", step_labels),
                     ("milestones", step_milestones), ("fields", step_fields), ("issues", step_issues),
                     ("deps", step_deps), ("assign", step_assign), ("items", step_items), ("views", step_views),
                     ("verify", step_verify), ("export", step_export)])

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not names or any(n not in STEPS for n in names):
        print(__doc__)
        sys.exit(2)
    for n in names:
        STEPS[n]()
    if counts:
        log(f"summary: {dict(counts)}")
