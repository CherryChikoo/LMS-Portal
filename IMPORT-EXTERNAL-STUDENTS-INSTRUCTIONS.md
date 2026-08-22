# How to Add External Students via Self-Registration

This guide explains how external students are created and how external colleges work in your LMS.

## What are External Colleges?

External colleges are institutions that appear ONLY when students **self-register** with a college name that doesn't exist in your official partner colleges list. They show up in the **"External Institutions" tab** on the Colleges page.

## 🚨 IMPORTANT: CSV Import Restrictions

**CSV import can ONLY assign students to existing partner colleges. It CANNOT create external colleges.**

- ✅ **CSV Import** → Assigns students to **existing partner institutions**
- ✅ **Self-Registration** → Creates **external institutions** automatically
- ❌ **CSV Import** → **NEVER** creates external colleges

This design ensures administrators maintain full control over the official partner college hierarchy.

## How External Colleges ARE Created

External colleges are created in **ONE WAY ONLY**:

### Student Self-Registration Flow
1. A student visits your LMS signup page
2. They fill in their details including their college name
3. If the college name doesn't match any existing partner college:
   - The system creates them as an "external student"
   - Their college appears in the "External Institutions" tab
   - The college is marked as originating from self-registration

## What About the CSV File?

The file `external-colleges-200-students.csv` contains 200 students across 3 colleges:
- **Global Tech University** (70 students)
- **International Business Institute** (65 students)
- **Advanced Science Academy** (65 students)

### To Use This CSV:

**Option 1: Create Partner Colleges First (Recommended)**
1. Go to `/colleges` page
2. Click **"Add College"** button
3. Manually create these 3 partner colleges:
   - Global Tech University
   - International Business Institute  
   - Advanced Science Academy
4. **Then** import the CSV to assign students to these colleges

**Option 2: Have Students Self-Register**
1. Share the signup link with 200 students
2. They register individually with their college names
3. The system automatically creates external colleges
4. External colleges appear in "External Institutions" tab

**Option 3: Use the API Script (Simulates Self-Registration)**
```bash
cd lms-portal
ADMIN_TOKEN=your_token_here node scripts/create-external-students.mjs
```
This script simulates 200 students self-registering, which properly creates external colleges.

## Student Data Format in CSV

Each student has:
- **Name**: Realistic Indian names
- **Email**: Unique email with college domain (e.g., `student@gtu.edu`)
- **College**: External college name
- **Department**: Relevant department for that college
- **Academic Year**: 1st Year through 4th Year
- **Section**: A, B, C, or D
- **Roll Number**: Unique ID (e.g., `GTU-001`)

## College Distribution

### Global Tech University (70 students)
- **Computer Science**: 24 students across 4 years
- **Information Technology**: 23 students across 4 years  
- **Electronics**: 23 students across 4 years

### International Business Institute (65 students)
- **Business Administration**: 22 students across 4 years
- **Marketing**: 22 students across 4 years
- **Finance**: 21 students across 4 years

### Advanced Science Academy (65 students)
- **Physics**: 17 students across 4 years
- **Chemistry**: 16 students across 4 years
- **Mathematics**: 16 students across 4 years
- **Biology**: 16 students across 4 years

## Important Notes About External Colleges

⚠️ **External colleges are NOT official partner institutions:**
- They don't have admin logins
- They can't be managed like partner colleges
- They're informational only - showing where external students come from
- Students from external colleges can still:
  - Take exams
  - View resources
  - Appear in leaderboards
  - Access all student features

✅ **To convert an external college to a partner college:**
1. Go to Colleges page > External Institutions tab
2. Find the external college
3. Click "Register as Partner College" button (if available)
4. This will convert it to a proper partner college with full admin capabilities

## CSV Import Error Handling

If you try to import a CSV with non-existent college names, you'll get an error like:

```
❌ Error: CSV contains colleges that don't exist as partner institutions.

The following colleges must be created as partner institutions first:
- Global Tech University
- International Business Institute
- Advanced Science Academy

Hint: External colleges can only be created via student self-registration, not CSV import.
```

**Solution:** Create these colleges as partner institutions first, then import the CSV.

## Troubleshooting

### "College doesn't exist" error during CSV import
- **Cause**: CSV contains college names that aren't in your partner colleges list
- **Fix**: Either:
  1. Create the colleges as partner institutions first
  2. Use the API script to simulate self-registration
  3. Have actual students self-register

### External colleges don't appear after self-registration
- Wait a few seconds and refresh the page
- Check you're on the "External Institutions" tab, not "Partner Institutions"
- External colleges only appear when they have at least 1 student

### Want to test with fewer students?
- Open `external-colleges-200-students.csv`
- Delete rows (but keep the header row!)
- Create the colleges as partners first
- Import the smaller file

## Summary

| Method | Creates External Colleges? | Creates Partner Colleges? | Assigns to Existing Colleges? |
|--------|---------------------------|---------------------------|------------------------------|
| **CSV Import** | ❌ No | ❌ No | ✅ Yes |
| **Self-Registration** | ✅ Yes | ❌ No | ✅ Yes (if exists) |
| **Admin "Add College"** | ❌ No | ✅ Yes | N/A |

🎯 **Best Practice**: Create partner colleges manually via admin panel, then use CSV to bulk-import their students.
