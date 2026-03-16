"""Social media summary management for ASM3.

Handles daily summary generation (data gathering + AI), storage, and CRUD.
"""

import sys
from datetime import datetime, timedelta

import asm3.al
import asm3.users
import asm3.utils
from asm3.sitedefs import AI_ENABLED, AI_API_KEY
from asm3.typehints import Database, ResultRow, Results

STATUS_DRAFT = 0
STATUS_APPROVED = 1
STATUS_POSTED = 2

SHELTER_NAME = "our hedgehog rescue"

PROMPT_TEMPLATE = """You are the social media manager for {shelter_name}.
Based on the following shelter activity from the last 24 hours, write an
engaging social media post suitable for Facebook or Instagram.

Guidelines:
- Tone: positive, uplifting, warm, conversational
- Mention hedgehogs by their names wherever possible
- Thank volunteers and staff by their first name in a shout-out section
- Keep it between 150-300 words
- Include 2-3 relevant emojis (hedgehog, heart, star, leaf, etc.)
- If there were any releases to the wild, celebrate them as the ultimate success story
- If there were any sad events (deaths), handle with gentle sensitivity - acknowledge but don't dwell
- If there were new arrivals, welcome them warmly
- If there was no activity, write a brief warm post about the ongoing daily care of hedgehogs at the shelter
- Do NOT invent or fabricate any information not present in the data
- Do NOT include hashtags in the main body text
- Add 3-5 relevant hashtags at the very end, separated from the main text

Here is the shelter activity data:

{data}
"""

# Movement type ID to friendly name
MOVEMENT_NAMES = {
    1: "Adopted",
    2: "Fostered",
    3: "Transferred",
    4: "Escaped",
    5: "Reclaimed by Owner",
    6: "Stolen",
    7: "Released to the Wild",
    8: "Sent to Retailer",
}

# --- CRUD ---

def get_summaries(dbo: Database, limit: int = 30) -> Results:
    """Returns recent social media summaries."""
    return dbo.query("SELECT * FROM social_media_summary ORDER BY SummaryDate DESC LIMIT ?", [limit])

def get_summary(dbo: Database, summary_id: int) -> ResultRow:
    """Returns a single summary by ID."""
    return dbo.query("SELECT * FROM social_media_summary WHERE ID=?", [summary_id])

def get_summary_by_date(dbo: Database, summary_date) -> ResultRow:
    """Returns a summary for a specific date, or None."""
    rows = dbo.query("SELECT * FROM social_media_summary WHERE SummaryDate=?", [summary_date])
    if len(rows) > 0:
        return rows[0]
    return None

def insert_summary(dbo: Database, username: str, summary_date, raw_data: str, generated_text: str) -> int:
    """Inserts a new social media summary."""
    return dbo.insert("social_media_summary", {
        "SummaryDate": summary_date,
        "RawData": raw_data,
        "GeneratedText": generated_text,
        "EditedText": "",
        "Status": STATUS_DRAFT,
        "PostedDate": None,
        "PostedBy": "",
        "Platform": "",
    }, username)

def update_summary_text(dbo: Database, username: str, summary_id: int, edited_text: str) -> None:
    """Updates the edited text of a summary."""
    dbo.update("social_media_summary", summary_id, {
        "EditedText": edited_text,
    }, username)

def update_summary_status(dbo: Database, username: str, summary_id: int, status: int) -> None:
    """Updates the status of a summary."""
    data = { "Status": status }
    if status == STATUS_POSTED:
        data["PostedDate"] = dbo.now()
        data["PostedBy"] = username
    dbo.update("social_media_summary", summary_id, data, username)

def delete_summary(dbo: Database, username: str, summary_id: int) -> None:
    """Deletes a summary."""
    dbo.delete("social_media_summary", summary_id, username)
    asm3.al.debug("Deleted social media summary %d" % summary_id, "social_media.delete_summary", dbo)

# --- Data gathering ---

def gather_data(dbo: Database, cutoff_date) -> dict:
    """Gather shelter activity recorded since cutoff_date.

    Filters by CreatedDate/LastChangedDate (when records were created or modified),
    NOT by event date. This ensures movements recorded today with yesterday's date
    are included, and off-shelter deaths are not excluded.
    """
    data = {}

    data["new_arrivals"] = dbo.query(
        "SELECT a.ID, a.ShelterCode, a.AnimalName, a.DateBroughtIn, a.CreatedBy "
        "FROM animal a "
        "WHERE a.NonShelterAnimal = 0 AND a.CreatedDate >= ? "
        "ORDER BY a.CreatedDate DESC",
        [cutoff_date]
    )

    data["movements"] = dbo.query(
        "SELECT ad.ID, ad.MovementType, ad.MovementDate, ad.Comments, "
        "an.ShelterCode, an.AnimalName, "
        "o.OwnerName, ad.CreatedBy "
        "FROM adoption ad "
        "INNER JOIN animal an ON ad.AnimalID = an.ID "
        "LEFT JOIN owner o ON ad.OwnerID = o.ID "
        "WHERE ad.CreatedDate >= ? "
        "ORDER BY ad.CreatedDate DESC",
        [cutoff_date]
    )

    data["deaths"] = dbo.query(
        "SELECT a.ID, a.ShelterCode, a.AnimalName, a.DeceasedDate, "
        "a.PutToSleep, a.AnimalComments, dr.ReasonName, a.LastChangedBy "
        "FROM animal a "
        "INNER JOIN deathreason dr ON a.PTSReasonID = dr.ID "
        "WHERE a.DeceasedDate IS NOT NULL AND a.LastChangedDate >= ? "
        "AND a.NonShelterAnimal = 0 "
        "ORDER BY a.LastChangedDate DESC",
        [cutoff_date]
    )

    data["logs"] = dbo.query(
        "SELECT l.Comments, l.Date, lt.LogTypeName, a.AnimalName, a.ShelterCode, l.CreatedBy "
        "FROM log l "
        "INNER JOIN logtype lt ON lt.ID = l.LogTypeID "
        "LEFT JOIN animal a ON l.LinkType = 0 AND l.LinkID = a.ID "
        "WHERE l.CreatedDate >= ? "
        "ORDER BY l.Date DESC",
        [cutoff_date]
    )

    data["census"] = dbo.query_int(
        "SELECT COUNT(*) FROM animal a "
        "INNER JOIN internallocation il ON il.ID = a.ShelterLocation "
        "WHERE a.Archived=0 AND a.NonShelterAnimal=0 "
        "AND il.LocationName NOT IN ('Unknown', 'Invalid')"
    )

    # Collect unique usernames, map to first names
    usernames = set()
    for row in data["new_arrivals"]:
        if row.CREATEDBY: usernames.add(row.CREATEDBY)
    for row in data["movements"]:
        if row.CREATEDBY: usernames.add(row.CREATEDBY)
    for row in data["deaths"]:
        if row.LASTCHANGEDBY: usernames.add(row.LASTCHANGEDBY)
    for row in data["logs"]:
        if row.CREATEDBY: usernames.add(row.CREATEDBY)

    people = {}
    for username in usernames:
        try:
            real_name = asm3.users.get_real_name(dbo, username)
            if real_name:
                people[username] = real_name.strip().split()[0]
            else:
                people[username] = username
        except Exception:
            people[username] = username
    data["people"] = people

    return data

# --- Formatting ---

def format_data(data: dict, summary_date) -> str:
    """Format gathered data into structured text for the AI prompt."""
    people = data["people"]
    lines = []
    lines.append("=== SHELTER DAILY ACTIVITY SUMMARY ===")
    lines.append("Date: %s" % summary_date.strftime("%A, %d %B %Y"))
    lines.append("Hedgehogs currently in care: %d" % data["census"])
    lines.append("")

    has_events = (data["new_arrivals"] or data["movements"] or
                  data["deaths"] or data["logs"])

    if not has_events:
        lines.append("No recorded events in the last 24 hours.")
        lines.append("(The shelter continues its daily care routines: feeding, health checks, cage cleaning, etc.)")
    else:
        if data["new_arrivals"]:
            lines.append("--- NEW ARRIVALS ---")
            for row in data["new_arrivals"]:
                first_name = people.get(row.CREATEDBY, row.CREATEDBY or "")
                parts = ["%s (%s)" % (row.ANIMALNAME, row.SHELTERCODE)]
                if first_name:
                    parts.append("[recorded by %s]" % first_name)
                lines.append("  - %s" % " ".join(parts))
            lines.append("")

        if data["movements"]:
            by_type = {}
            for row in data["movements"]:
                mt = row.MOVEMENTTYPE or 0
                if mt not in by_type:
                    by_type[mt] = []
                by_type[mt].append(row)

            for mt, section_name in MOVEMENT_NAMES.items():
                if mt in by_type:
                    lines.append("--- %s ---" % section_name.upper())
                    for row in by_type[mt]:
                        first_name = people.get(row.CREATEDBY, row.CREATEDBY or "")
                        parts = ["%s (%s)" % (row.ANIMALNAME, row.SHELTERCODE)]
                        if row.OWNERNAME:
                            parts.append("- to %s" % row.OWNERNAME)
                        comment = (row.COMMENTS or "").strip()
                        if comment:
                            if len(comment) > 200:
                                comment = comment[:200] + "..."
                            parts.append('"%s"' % comment)
                        if first_name:
                            parts.append("[recorded by %s]" % first_name)
                        lines.append("  - %s" % " ".join(parts))
                    lines.append("")

        if data["deaths"]:
            lines.append("--- PASSED AWAY ---")
            for row in data["deaths"]:
                first_name = people.get(row.LASTCHANGEDBY, row.LASTCHANGEDBY or "")
                parts = ["%s (%s)" % (row.ANIMALNAME, row.SHELTERCODE)]
                reason = row.REASONNAME or ""
                if reason:
                    parts.append("- %s" % reason)
                if row.PUTTOSLEEP:
                    parts.append("(euthanised)")
                comment = (row.ANIMALCOMMENTS or "").strip()
                if comment:
                    if len(comment) > 200:
                        comment = comment[:200] + "..."
                    parts.append('"%s"' % comment)
                if first_name:
                    parts.append("[recorded by %s]" % first_name)
                lines.append("  - %s" % " ".join(parts))
            lines.append("")

        if data["logs"]:
            lines.append("--- LOG ENTRIES (feeding, observations, notes) ---")
            for row in data["logs"]:
                log_type = row.LOGTYPENAME or "Note"
                animal_name = row.ANIMALNAME or ""
                code = row.SHELTERCODE or ""
                comment = (row.COMMENTS or "").strip()
                changed_by = row.CREATEDBY or ""
                first_name = people.get(changed_by, changed_by)

                parts = []
                if animal_name:
                    parts.append("%s (%s)" % (animal_name, code))
                parts.append("[%s]" % log_type)
                if comment:
                    if len(comment) > 200:
                        comment = comment[:200] + "..."
                    parts.append(comment)
                if first_name:
                    parts.append("[by %s]" % first_name)

                lines.append("  - %s" % " ".join(parts))
            lines.append("")

    if people:
        first_names = sorted(set(people.values()))
        lines.append("--- PEOPLE WHO HELPED TODAY ---")
        lines.append(", ".join(first_names))
        lines.append("")

    return "\n".join(lines)

# --- AI generation ---

def get_recent_post_history(dbo: Database, days: int = 3) -> str:
    """Get the last few days' generated posts to provide context for the AI.

    Returns a formatted string of recent posts, or empty string if none.
    """
    rows = dbo.query(
        "SELECT SummaryDate, COALESCE(NULLIF(EditedText, ''), GeneratedText) AS PostText "
        "FROM social_media_summary "
        "ORDER BY SummaryDate DESC LIMIT ?",
        [days]
    )
    if not rows:
        return ""
    lines = ["=== RECENT POSTS (for context - do not repeat phrases, vary your style) ==="]
    for row in rows:
        date_str = row.SUMMARYDATE
        if hasattr(date_str, 'strftime'):
            date_str = date_str.strftime("%A, %d %B %Y")
        text = (row.POSTTEXT or "").strip()
        if text:
            if len(text) > 500:
                text = text[:500] + "..."
            lines.append("\n--- %s ---" % date_str)
            lines.append(text)
    lines.append("\n=== END RECENT POSTS ===\n")
    return "\n".join(lines)

def generate_summary_text(dbo: Database, data_text: str) -> str:
    """Call the configured AI provider to generate a social media post.

    Uses the same provider/model/API key as the AI assistant (from .env).
    If a custom prompt is set in Settings > AI, it is used instead of the default.
    Includes the last few days' posts as context for variety and flow.
    Returns the generated text, or raises on failure.
    """
    import asm3.configuration
    from asm3.ai_providers import get_provider

    provider = get_provider()

    # Get recent post history for context
    history = get_recent_post_history(dbo)

    # Use custom prompt from settings if configured, otherwise use default
    custom_prompt = asm3.configuration.social_media_prompt(dbo)
    if custom_prompt and custom_prompt.strip():
        if "{data}" in custom_prompt:
            prompt = custom_prompt.replace("{data}", data_text)
        else:
            prompt = custom_prompt + "\n\n" + data_text
    else:
        prompt = PROMPT_TEMPLATE.format(shelter_name=SHELTER_NAME, data=data_text)

    # Append history after the prompt so the AI sees previous posts
    if history:
        prompt += "\n\n" + history

    messages = [{"role": "user", "content": prompt}]
    response = provider.chat("You are a social media manager for a hedgehog rescue.", messages, [])
    return response.text.strip()

# --- Daily task (called from cron.py) ---

def generate_daily_summary(dbo: Database) -> None:
    """Generate the daily social media summary. Called by cron.daily().

    Gathers last 24h of activity, sends to AI, stores as draft.
    Skips if AI is not enabled or a summary already exists for today.
    """
    if not AI_ENABLED or not AI_API_KEY:
        asm3.al.debug("AI not enabled, skipping social media summary", "social_media.generate_daily_summary", dbo)
        return

    summary_date = dbo.now()
    cutoff_date = (summary_date - timedelta(days=1)).date()

    # Don't regenerate if one already exists for today
    existing = get_summary_by_date(dbo, summary_date)
    if existing:
        asm3.al.debug("Social media summary already exists for today, skipping",
            "social_media.generate_daily_summary", dbo)
        return

    try:
        data = gather_data(dbo, cutoff_date)
        data_text = format_data(data, summary_date)

        asm3.al.info("Generating social media summary: %d arrivals, %d movements, %d deaths, %d logs" % (
            len(data["new_arrivals"]), len(data["movements"]),
            len(data["deaths"]), len(data["logs"])),
            "social_media.generate_daily_summary", dbo)

        generated_text = generate_summary_text(dbo, data_text)

        insert_summary(dbo, "system", summary_date, data_text, generated_text)
        asm3.al.info("Social media summary generated and stored",
            "social_media.generate_daily_summary", dbo)

    except Exception as err:
        asm3.al.error("Failed to generate social media summary: %s" % err,
            "social_media.generate_daily_summary", dbo, sys.exc_info())

def regenerate_summary(dbo: Database, username: str, summary_id: int) -> str:
    """Regenerate the AI text for an existing summary using its stored raw data.

    Updates the record with the new generated text and resets status to draft.
    Returns the new generated text.
    """
    rows = dbo.query("SELECT * FROM social_media_summary WHERE ID=?", [summary_id])
    if len(rows) == 0:
        raise Exception("Summary %d not found" % summary_id)

    row = rows[0]
    raw_data = row.RAWDATA or ""
    if not raw_data:
        raise Exception("No raw data available to regenerate from")

    generated_text = generate_summary_text(dbo, raw_data)

    dbo.update("social_media_summary", summary_id, {
        "GeneratedText": generated_text,
        "EditedText": "",
        "Status": STATUS_DRAFT,
    }, username)

    asm3.al.info("Regenerated social media summary %d by %s" % (summary_id, username),
        "social_media.regenerate_summary", dbo)
    return generated_text
