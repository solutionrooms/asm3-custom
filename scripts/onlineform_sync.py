#!/usr/bin/env python3
"""
Keep ASM3 online forms as JSON files in the repo and sync them to a live
server through the same admin endpoints the Online Forms screens use.

    python3 scripts/onlineform_sync.py pull 33              # live -> forms/form_33.json
    python3 scripts/onlineform_sync.py diff 33              # show what push would change
    python3 scripts/onlineform_sync.py push 33              # file -> live (asks first)
    python3 scripts/onlineform_sync.py push 33 --delete     # also delete live fields not in the file

Fields keep their live "id" so a push updates form 33 in place (the public
URL never changes). A field without an "id" is created on push.

Credentials come from the environment, or from ~/.config/asm3/forms.env
(KEY=value lines, kept outside the repo):

    ASM_URL       default https://asmdo22.fridaydigital.co.uk
    ASM_DATABASE  default bghrc
    ASM_USERNAME
    ASM_PASSWORD  prompted for if missing
    ASM_OTP       2FA code, prompted for if the account asks for one

Only the Python standard library is used.
"""

import argparse
import getpass
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FORMS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "forms")
CREDENTIALS_FILE = os.path.expanduser("~/.config/asm3/forms.env")

# Mirrors FIELDTYPE_MAP in src/asm3/onlineform.py
FIELDTYPES = {
    "YESNO": 0, "TEXT": 1, "NOTES": 2, "LOOKUP": 3, "SHELTERANIMAL": 4, "ADOPTABLEANIMAL": 5,
    "COLOUR": 6, "BREED": 7, "SPECIES": 8, "RAWMARKUP": 9, "DATE": 10, "CHECKBOX": 11,
    "RADIOGROUP": 12, "SIGNATURE": 13, "LOOKUP_MULTI": 14, "GDPR_CONTACT_OPTIN": 15, "TIME": 16,
    "IMAGE": 17, "CHECKBOXGROUP": 18, "EMAIL": 19, "NUMBER": 20, "FOSTERANIMAL": 21, "TELEPHONE": 22
}
FIELDTYPES_REVERSE = { v: k for k, v in FIELDTYPES.items() }

# Form-level settings: file key -> (db column, post field, is_checkbox)
FORM_SETTINGS = [
    ("name",             "NAME",                 "name",             False),
    ("description",      "DESCRIPTION",          "description",      False),
    ("header",           "HEADER",               "header",           False),
    ("footer",           "FOOTER",               "footer",           False),
    ("redirect",         "REDIRECTURLAFTERPOST", "redirect",         False),
    ("autoprocess",      "AUTOPROCESS",          "autoprocess",      False),
    ("retainfor",        "RETAINFOR",            "retainfor",        False),
    ("flags",            "SETOWNERFLAGS",        "flags",            False),
    ("email",            "EMAILADDRESS",         "email",            False),
    ("emailcoordinator", "EMAILCOORDINATOR",     "emailcoordinator", True),
    ("emailfosterer",    "EMAILFOSTERER",        "emailfosterer",    True),
    ("emailsubmitter",   "EMAILSUBMITTER",       "emailsubmitter",   False),
    ("internaluse",      "INTERNALUSE",          "internaluse",      True),
    ("emailmessage",     "EMAILMESSAGE",         "emailmessage",     False),
]

FIELD_KEYS = ["name", "type", "label", "index", "mandatory", "lookups", "visibleif", "tooltip", "markup", "validationrule", "species"]


def load_credentials():
    if os.path.exists(CREDENTIALS_FILE):
        with open(CREDENTIALS_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    url = os.environ.get("ASM_URL", "https://asmdo22.fridaydigital.co.uk").rstrip("/")
    database = os.environ.get("ASM_DATABASE", "bghrc")
    username = os.environ.get("ASM_USERNAME") or input("ASM username: ")
    password = os.environ.get("ASM_PASSWORD") or getpass.getpass("ASM password for %s: " % username)
    return url, database, username, password


class ASM:
    def __init__(self, url, database, username, password):
        self.url = url
        self.database = database
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.login(username, password)

    def request(self, path, params=None, post=None):
        url = "%s/%s" % (self.url, path)
        if params: url += "?" + urllib.parse.urlencode(params)
        data = urllib.parse.urlencode(post).encode("utf-8") if post is not None else None
        req = urllib.request.Request(url, data=data, headers={ "User-Agent": "asm3-onlineform-sync" })
        try:
            with self.opener.open(req) as r:
                return r.read().decode("utf-8"), r.geturl()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            raise SystemExit("%s %s failed: HTTP %s\n%s" % ("POST" if post is not None else "GET", path, e.code, body[:500]))

    def login(self, username, password):
        post = { "database": self.database, "username": username, "password": password, "onetimepass": os.environ.get("ASM_OTP", "") }
        result, _ = self.request("login", post=post)
        if result.strip() == "ASK2FA":
            post["onetimepass"] = input("2FA code: ")
            result, _ = self.request("login", post=post)
        if result.strip() in ("FAIL", "DISABLED", "WRONGSERVER", "ASK2FA", "BAD2FA") or result.lstrip().startswith("<"):
            raise SystemExit("Login failed: %s" % result.strip()[:100])

    def get_json(self, path, params):
        body, finalurl = self.request(path, params=dict(params, json="true"))
        if "/login" in finalurl:
            raise SystemExit("Not logged in (redirected to login)")
        return json.loads(body)

    def post(self, path, post):
        return self.request(path, post=post)[0]

    def live_form(self, formid):
        forms = self.get_json("onlineforms", {})["rows"]
        form = next((f for f in forms if f["ID"] == formid), None)
        if form is None: raise SystemExit("Online form %d does not exist" % formid)
        fields = self.get_json("onlineform", { "formid": formid })["rows"]
        return form, fields


def form_to_file(form, fields):
    """ Converts live rows into the file structure """
    d = { "formid": form["ID"] }
    for key, col, _, checkbox in FORM_SETTINGS:
        v = form.get(col)
        d[key] = bool(v) if checkbox else ("" if v is None else v)
    d["fields"] = []
    for f in fields:
        ftype = FIELDTYPES_REVERSE[f["FIELDTYPE"]]
        fd = { "id": f["ID"], "name": f["FIELDNAME"], "type": ftype, "label": f["LABEL"] or "",
            "index": f["DISPLAYINDEX"] or 0, "mandatory": f["MANDATORY"] == 1,
            "lookups": f["LOOKUPS"] or "", "visibleif": f["VISIBLEIF"] or "" }
        # Raw markup fields store their markup in the Tooltip column
        if ftype == "RAWMARKUP": fd["markup"] = f["TOOLTIP"] or ""
        else: fd["tooltip"] = f["TOOLTIP"] or ""
        if f.get("VALIDATIONRULE"): fd["validationrule"] = f["VALIDATIONRULE"]
        if f.get("SPECIESID"): fd["species"] = f["SPECIESID"]
        d["fields"].append(fd)
    return d


def normalise_field(f):
    """ Fills defaults so file and live fields compare like for like """
    n = { "name": f["name"], "type": f["type"].upper(), "label": f.get("label", ""), "index": int(f.get("index", 0)),
        "mandatory": bool(f.get("mandatory", False)), "lookups": f.get("lookups", ""), "visibleif": f.get("visibleif", ""),
        "validationrule": int(f.get("validationrule", 0)), "species": int(f.get("species", 0)) }
    if n["type"] not in FIELDTYPES: raise SystemExit("Field %s has unknown type %s" % (f["name"], f["type"]))
    if n["type"] == "RAWMARKUP": n["markup"] = f.get("markup", f.get("tooltip", ""))
    else: n["tooltip"] = f.get("tooltip", "")
    return n


def field_post(formid, f):
    n = normalise_field(f)
    post = { "formid": formid, "fieldname": n["name"], "fieldtype": FIELDTYPES[n["type"]], "label": n["label"],
        "displayindex": n["index"], "lookups": n["lookups"], "visibleif": n["visibleif"],
        "species": n["species"], "validationrule": n["validationrule"],
        "tooltip": n.get("tooltip", ""), "rawmarkup": n.get("markup", "") }
    if n["mandatory"]: post["mandatory"] = "on"
    return post


def plan(formid, wanted, form, fields):
    """ Returns a list of (description, path, post) actions to make live match wanted """
    actions = []
    live = form_to_file(form, fields)
    changed = [ k for k, _, _, _ in FORM_SETTINGS if k in wanted and wanted[k] != live[k] ]
    if changed:
        post = { "formid": formid }
        for key, _, pf, checkbox in FORM_SETTINGS:
            v = wanted.get(key, live[key])
            if checkbox:
                if v: post[pf] = "on"
            else:
                post[pf] = v
        actions.append(("update form settings: %s" % ", ".join(changed), "onlineforms", dict(post, mode="update")))

    livebyid = { f["id"]: f for f in live["fields"] }
    seen = set()
    for f in wanted.get("fields", []):
        fid = f.get("id")
        if fid is None:
            actions.append(("create field %s (%s)" % (f["name"], f["type"]), "onlineform", dict(field_post(formid, f), mode="create")))
            continue
        if fid not in livebyid:
            raise SystemExit("Field %s has id %s which is not on live form %d - remove the id to create it" % (f["name"], fid, formid))
        seen.add(fid)
        a, b = normalise_field(livebyid[fid]), normalise_field(f)
        diffs = [ k for k in b if a.get(k) != b.get(k) ]
        if diffs:
            detail = "; ".join("%s: %r -> %r" % (k, short(a.get(k)), short(b.get(k))) for k in diffs)
            actions.append(("update field %s [%s]" % (f["name"], detail), "onlineform", dict(field_post(formid, f), mode="update", formfieldid=fid)))
    for fid, f in livebyid.items():
        if fid not in seen:
            actions.append(("DELETE field %s (id %d)" % (f["name"], fid), "onlineform", { "mode": "delete", "formid": formid, "ids": fid }))
    return actions


def short(v, n=60):
    s = str(v)
    return s if len(s) <= n else s[:n] + "..."


def default_path(formid):
    return os.path.join(FORMS_DIR, "form_%d.json" % formid)


def read_file(path):
    with open(path) as f:
        return json.load(f)


def cmd_pull(asm, args):
    form, fields = asm.live_form(args.formid)
    path = args.file or default_path(args.formid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(form_to_file(form, fields), f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("Wrote %s (%d fields)" % (path, len(fields)))


def cmd_diff(asm, args, quiet_if_none=False):
    wanted = read_file(args.file or default_path(args.formid))
    form, fields = asm.live_form(args.formid)
    actions = plan(args.formid, wanted, form, fields)
    if not actions and not quiet_if_none: print("No changes - live form %d matches the file" % args.formid)
    for desc, _, _ in actions: print("  " + desc)
    return actions


def cmd_push(asm, args):
    actions = cmd_diff(asm, args)
    if not actions: return
    deletes = [ a for a in actions if a[0].startswith("DELETE") ]
    if deletes and not args.delete:
        print("\nRefusing: %d live field(s) are not in the file. Re-run with --delete to remove them, or pull first." % len(deletes))
        sys.exit(1)
    if not args.yes and input("\nApply %d change(s) to %s form %d? [y/N] " % (len(actions), asm.url, args.formid)).lower() != "y":
        print("Cancelled")
        return
    for desc, path, post in actions:
        asm.post(path, post)
        print("  done: " + desc)
    # Renumber display indexes the same way the Online Form screen does
    asm.post("onlineform", { "mode": "reindex", "formid": args.formid })
    # Pull back so the file picks up new ids and reindexed positions
    cmd_pull(asm, args)
    # The public form is cached by query string for 30 minutes; a unique query bypasses that
    print("Fresh preview: %s/service?account=%s&method=online_form_html&formid=%d&nocache=%d" % (asm.url, asm.database, args.formid, int(time.time())))


def main():
    p = argparse.ArgumentParser(description="Sync ASM3 online forms with JSON files")
    p.add_argument("command", choices=["pull", "diff", "push"])
    p.add_argument("formid", type=int)
    p.add_argument("--file", help="JSON file (default forms/form_<id>.json)")
    p.add_argument("--delete", action="store_true", help="push: allow deleting live fields missing from the file")
    p.add_argument("--yes", action="store_true", help="push: do not ask for confirmation")
    args = p.parse_args()
    asm = ASM(*load_credentials())
    { "pull": cmd_pull, "diff": cmd_diff, "push": cmd_push }[args.command](asm, args)


if __name__ == "__main__":
    main()
