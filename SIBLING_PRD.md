# Sibling Quick Add - Product Requirements Document

> ASM3 Animal Shelter Manager - Batch Sibling Induction

## 1. Product Overview

### Problem Statement
When inducting a litter of animals (e.g. a nest of hoglets), the operator must currently fill in the full induction form repeatedly for each sibling. Since siblings share almost all attributes (species, breed, DOB, location, entry details, litter ID), this is tedious and error-prone. For a litter of 5, the operator fills in the same data 5 times.

### Solution
Add a "number of siblings" control to the bottom of the existing induction forms (`animal_new` and `animal_induction`). When set to a value greater than 0, submitting the form creates the primary animal plus N additional copies with auto-numbered names. All siblings are linked via a shared Litter ID (`AcceptanceNumber`). After creation, the user is redirected to a search results page showing all the newly created siblings, so they can quickly click into each one to make individual edits (e.g. name, sex, markings).

### Primary Use Cases

| Use Case | Example | Outcome |
|----------|---------|---------|
| Induct a litter | Fill in form for "Hoglet", set siblings to 4 | Creates "Hoglet 1", "Hoglet 2", "Hoglet 3", "Hoglet 4", "Hoglet 5" all linked by litter |
| Edit individual siblings | Redirected to search results for "Hoglet" | Operator clicks each animal to rename, set sex, add notes |
| Link to existing litter | Select existing litter ID on form | All siblings assigned to that litter |
| New litter auto-created | No litter ID selected, siblings > 0 | A new litter record is created and assigned to all siblings |

### Target Users
- Shelter staff performing animal intake
- Anyone inducting multiple animals from the same litter/nest

---

## 2. Design

### User Flow

1. Operator navigates to **Add Animal** (`animal_new`) or **Animal Induction** (`animal_induction`)
2. Fills in the form as normal (name, species, breed, DOB, location, etc.)
3. At the bottom of the form, sets **"Number of siblings"** spinner (default: 0, range: 0-20)
4. Clicks **Save** / **Induct**
5. Backend creates the primary animal, then clones it N times with auto-numbered names
6. All animals are assigned the same Litter ID
7. Browser redirects to `/search?q={base_name}` showing all newly created siblings
8. Operator clicks into each sibling to make individual edits (rename, set sex, etc.)

### Naming Convention

Given base name "Hoglet" and sibling count of 4:
- "Hoglet 1" (the primary animal, renamed with suffix)
- "Hoglet 2" (first clone)
- "Hoglet 3" (second clone)
- "Hoglet 4" (third clone)
- "Hoglet 5" (fourth clone)

Total animals created = sibling count + 1 (the original). The original animal is also numbered for consistency across the litter.

### Litter Linking

- If the user has already selected a **Litter ID** on the form, all siblings use that litter ID
- If no Litter ID is selected and siblings > 0, a **new litter record** is auto-created in the `animallitter` table with:
  - `AcceptanceNumber` = auto-generated litter code
  - `SpeciesID` = from form
  - `Date` = date of birth from form
  - `NumberInLitter` = sibling count + 1
- All created animals get the same `AcceptanceNumber`, making them visible as littermates in the existing ASM3 links/littermate views

---

## 3. Technical Implementation

### Backend Changes

#### `src/asm3/animal.py`

New function: **`insert_siblings_from_form(dbo, post, user, primary_animal_id, sibling_count)`**

- Takes the already-created primary animal ID and the original form data
- Uses `clone_animal()` to create each sibling (reuses existing clone logic for copying fields)
- After cloning, updates each sibling's name to `{base_name} {n}`
- Renames the primary animal to `{base_name} 1`
- Ensures all animals share the same `AcceptanceNumber`
- If no litter exists, creates one via `dbo.insert("animallitter", ...)`
- Returns the base name (for search redirect)

#### `src/main.py`

Modify **`animal_new.post_save()`** and **`animal_induction.post_save()`**:

- Read new `siblings` parameter from form POST data
- If `siblings > 0`:
  - After `insert_animal_from_form()`, call `insert_siblings_from_form()`
  - Return redirect URL to `/search?q={base_name}` instead of the individual animal page
- If `siblings == 0`: existing behaviour unchanged

### Frontend Changes

#### `src/static/js/animal_new.js`

- Add a new form row at the bottom (before the save button):
  ```
  Number of siblings: [spinner 0-20]
  ```
- Include the `siblings` value in the POST data on save
- Handle redirect response: if the backend returns a search URL instead of an animal ID, redirect to search

#### `src/static/js/animal_induction.js`

- Same sibling spinner addition as `animal_new.js`
- Same POST data and redirect handling

### Files Modified

| File | Change |
|------|--------|
| `src/asm3/animal.py` | New `insert_siblings_from_form()` function |
| `src/main.py` | Modify `animal_new.post_save()` and `animal_induction.post_save()` |
| `src/static/js/animal_new.js` | Add sibling count spinner, handle redirect |
| `src/static/js/animal_induction.js` | Add sibling count spinner, handle redirect |

### No Changes Required

- **Permissions**: No new permission needed; anyone who can add an animal can add siblings
- **Database schema**: No new tables or columns; uses existing `AcceptanceNumber` and `animallitter`
- **Config**: No new environment variables
- **CSS/Icons**: Uses existing jQuery UI spinner widget

---

## 4. Edge Cases

| Case | Behaviour |
|------|-----------|
| Siblings = 0 | Normal single-animal induction (no change) |
| Name is blank | Validation rejects before sibling logic runs |
| Duplicate names | Each sibling gets a unique numbered suffix, avoiding duplicate name validation errors |
| Duplicate microchip | Only the primary animal gets the microchip; clones have it cleared |
| Existing litter ID selected | All siblings assigned to that litter; `NumberInLitter` updated |
| Siblings = 1 | Creates 2 animals: "Name 1" and "Name 2" |
| Manual shelter code | Only primary gets the manual code; siblings get auto-generated codes |

---

## 5. Future Enhancements (Out of Scope)

These are explicitly **not** part of the initial implementation:

- Editable preview table (set name/sex per sibling before saving)
- Batch medical record creation across siblings
- Sex distribution selector (e.g. "3 male, 2 female")
- Bonded animal linking (limited to 2 bonds, doesn't scale for litters)
