"""
Validation Engine (LogicRed).

Runs explainable, rule-based checks over one student-level admission record
submitted by an AICTE-approved institution and keyed by APAAR ID.
Every result carries: rule, status (PASS|WARNING|FAIL), severity
(LOW|MEDIUM|HIGH), a human-readable message and the affected field.

Checks covered (per the problem statement):
  * invalid / missing APAAR IDs
  * duplicate student records (same APAAR ID, institution and admission year)
  * admissions exceeding approved intake
  * inconsistencies in student data (NRI / OCI / Foreign National / supernumerary)
  * potential duplicate enrolment across institutions

IMPORTANT: this engine never labels anyone as fraudulent. It only flags
"potential inconsistencies" that require official verification.
"""
import re
from datetime import datetime
from typing import Dict, List, Optional, TypedDict

from ...database import records_collection, institutions_collection

APAAR_PATTERN = re.compile(r"^\d{12}$")          # APAAR ID is a 12-digit number
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MOBILE_PATTERN = re.compile(r"^(\+91)?[6-9]\d{9}$")
DATE_FORMATS = ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"]


class ValidationOutcome(TypedDict):
    rule: str
    status: str
    severity: str
    message: str
    affected_field: Optional[str]


def _get_val(fields: Dict[str, Optional[str]], name: str) -> Optional[str]:
    v = fields.get(name)
    if v is None:
        return None
    v = str(v).strip()
    return v if v else None


def _is_yes(fields: Dict[str, Optional[str]], name: str) -> bool:
    return (_get_val(fields, name) or "").lower() in ("yes", "y", "true", "1")


def _parse_int(value: Optional[str]) -> Optional[int]:
    try:
        return int(str(value).strip()) if value not in (None, "") else None
    except ValueError:
        return None


def _parse_date(value: str) -> Optional[datetime]:
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _valid_date(value: str) -> bool:
    return _parse_date(value) is not None


def _match(field_name: str, value: str) -> dict:
    return {"fields": {"$elemMatch": {"field_name": field_name, "value": value}}}


async def run_validation(
    record_id: str,
    fields: Dict[str, Optional[str]],
    related_area_evidence: Optional[str] = None,  # kept for pipeline compatibility
) -> List[ValidationOutcome]:
    results: List[ValidationOutcome] = []

    def add(rule, status, severity, message, affected_field=None):
        results.append({"rule": rule, "status": status, "severity": severity,
                        "message": message, "affected_field": affected_field})

    # ---------------- APAAR ID ----------------
    apaar = _get_val(fields, "apaar_id")
    if not apaar:
        add("missing_apaar_id", "FAIL", "HIGH", "APAAR ID is missing.", "apaar_id")
    elif not APAAR_PATTERN.match(apaar):
        add("invalid_apaar_id", "FAIL", "HIGH",
            "APAAR ID is invalid — it must be a 12-digit number.", "apaar_id")
    else:
        add("valid_apaar_id", "PASS", "LOW", "APAAR ID format is valid.", "apaar_id")

    # ---------------- Required fields ----------------
    for fname, label in (("student_name", "Student name"), ("student_id", "Institution student ID"),
                         ("institution_id", "Institution (AICTE approval) ID"),
                         ("program", "Program"), ("year_of_admission", "Year of admission")):
        if _get_val(fields, fname):
            add(f"required_{fname}", "PASS", "LOW", f"{label} present.", fname)
        else:
            add(f"required_{fname}", "FAIL", "HIGH" if fname != "student_id" else "MEDIUM",
                f"{label} is missing.", fname)

    # ---------------- Format checks ----------------
    dob = _get_val(fields, "dob")
    if dob:
        d = _parse_date(dob)
        if d is None:
            add("format_dob", "WARNING", "MEDIUM", "Date of birth does not match DD-MM-YYYY.", "dob")
        else:
            age = (datetime.utcnow() - d).days / 365.25
            if 15 <= age <= 60:
                add("format_dob", "PASS", "LOW", "Date of birth is valid and plausible.", "dob")
            else:
                add("logical_dob", "WARNING", "MEDIUM",
                    f"Date of birth implies an unusual age ({age:.0f} years) for an admitted student.", "dob")

    year = _parse_int(_get_val(fields, "year_of_admission"))
    if _get_val(fields, "year_of_admission"):
        if year is not None and 2000 <= year <= datetime.utcnow().year:
            add("format_year_of_admission", "PASS", "LOW", "Year of admission is valid.", "year_of_admission")
        else:
            add("format_year_of_admission", "FAIL", "HIGH",
                "Year of admission is not a valid year.", "year_of_admission")

    email = _get_val(fields, "email")
    if email:
        if EMAIL_PATTERN.match(email):
            add("format_email", "PASS", "LOW", "Email format valid.", "email")
        else:
            add("format_email", "WARNING", "LOW", "Email format looks invalid.", "email")
    mobile = _get_val(fields, "mobile")
    if mobile:
        if MOBILE_PATTERN.match(mobile.replace(" ", "")):
            add("format_mobile", "PASS", "LOW", "Mobile number format valid.", "mobile")
        else:
            add("format_mobile", "WARNING", "LOW", "Mobile number format looks invalid.", "mobile")

    # ---------------- Consent ----------------
    if _is_yes(fields, "consent_given"):
        add("consent_recorded", "PASS", "LOW", "Student consent for data sharing/verification recorded.", "consent_given")
    else:
        add("consent_missing", "WARNING", "HIGH",
            "Student consent for data sharing and third-party verification is not recorded.", "consent_given")

    # ---------------- Duplicate / cross-institution checks ----------------
    inst = _get_val(fields, "institution_id")
    prog = _get_val(fields, "program")
    year_s = _get_val(fields, "year_of_admission")

    if apaar and APAAR_PATTERN.match(apaar):
        base = {"_id": {"$ne": record_id}, "status": {"$ne": "REJECTED"}, **_match("apaar_id", apaar)}

        if inst:
            dup = await records_collection.find_one({"$and": [base, _match("institution_id", inst)]})
            if dup:
                add("duplicate_student_record", "FAIL", "HIGH",
                    f"Duplicate student record: APAAR ID {apaar} is already submitted for this institution "
                    f"(record {dup['_id']}).", "apaar_id")
            else:
                add("duplicate_student_record", "PASS", "LOW", "No duplicate student record found.", "apaar_id")

            other_q = {"$and": [base, {"fields": {"$elemMatch": {"field_name": "institution_id", "value": {"$ne": inst}}}}]}
            other = await records_collection.find_one(other_q)
            if other:
                other_f = {f["field_name"]: f["value"] for f in other["fields"]}
                same_year = year_s and other_f.get("year_of_admission") == year_s
                add("cross_institution_duplicate", "WARNING", "HIGH",
                    f"Potential duplicate enrolment: APAAR ID {apaar} is also enrolled at institution "
                    f"{other_f.get('institution_name') or other_f.get('institution_id')}"
                    f"{' in the same admission year' if same_year else ''}. "
                    "Potential inconsistency detected — requires official verification.", "apaar_id")
            else:
                add("cross_institution_duplicate", "PASS", "LOW",
                    "No concurrent enrolment at another institution found.", "apaar_id")

    # ---------------- Intake checks ----------------
    submitted_intake = _parse_int(_get_val(fields, "approved_intake"))
    registry_intake = None
    if inst and prog:
        reg = await institutions_collection.find_one({"_id": inst})
        if reg:
            registry_intake = (reg.get("approved_intake") or {}).get(prog)
    approved = registry_intake if registry_intake is not None else submitted_intake

    if registry_intake is not None and submitted_intake is not None and registry_intake != submitted_intake:
        add("intake_mismatch_with_registry", "WARNING", "MEDIUM",
            f"Submitted approved intake ({submitted_intake}) differs from the AICTE-approved intake on record "
            f"({registry_intake}).", "approved_intake")

    if approved is None:
        add("intake_unknown", "WARNING", "MEDIUM",
            "Approved intake is unavailable for this institution/program, so intake limits cannot be checked.",
            "approved_intake")
    elif inst and prog and year_s and not _is_yes(fields, "supernumerary_seat"):
        q = {"$and": [
            {"_id": {"$ne": record_id}, "status": {"$ne": "REJECTED"}},
            _match("institution_id", inst), _match("program", prog), _match("year_of_admission", year_s),
            {"fields": {"$not": {"$elemMatch": {"field_name": "supernumerary_seat", "value": "Yes"}}}},
        ]}
        existing = await records_collection.count_documents(q)
        if existing + 1 > approved:
            add("admissions_exceed_intake", "FAIL", "HIGH",
                f"Admissions exceed approved intake: this admission makes {existing + 1} regular-seat students "
                f"against an approved intake of {approved} ({prog}, {year_s}). "
                "Potential inconsistency detected — requires official verification.", "approved_intake")
        else:
            add("admissions_exceed_intake", "PASS", "LOW",
                f"Within approved intake ({existing + 1}/{approved}).", "approved_intake")

    elif approved is not None and _is_yes(fields, "supernumerary_seat"):
        add("admissions_exceed_intake", "PASS", "LOW",
            "Supernumerary seat — not counted against approved intake.", "approved_intake")

    actual = _parse_int(_get_val(fields, "actual_enrolment"))
    if actual is not None and approved is not None and actual > approved:
        add("declared_enrolment_exceeds_intake", "WARNING", "MEDIUM",
            f"Declared actual enrolment ({actual}) is above approved intake ({approved}); confirm the excess "
            "consists of supernumerary seats.", "actual_enrolment")

    # ---------------- Data consistency (NRI / OCI / FN / supernumerary) ----------------
    nri, oci, fn, sup = (_is_yes(fields, n) for n in ("nri_category", "oci_status", "foreign_national", "supernumerary_seat"))
    nationality = (_get_val(fields, "nationality") or "").lower()

    if oci and fn:
        add("inconsistent_oci_fn", "WARNING", "HIGH",
            "Student is marked both OCI and Foreign National — these categories are normally mutually exclusive.",
            "oci_status")
    if nri and fn:
        add("inconsistent_nri_fn", "WARNING", "HIGH",
            "Student is marked both NRI and Foreign National — please confirm the category.", "nri_category")
    if (fn or oci) and not sup:
        add("inconsistent_supernumerary", "WARNING", "MEDIUM",
            "Foreign National / OCI admissions are normally made against supernumerary seats, but this record "
            "is marked as a regular seat.", "supernumerary_seat")
    if fn and nationality in ("indian", "india"):
        add("inconsistent_nationality", "WARNING", "HIGH",
            "Student is marked Foreign National but nationality is recorded as Indian.", "foreign_national")
    if not (oci and fn) and not (nri and fn) and not ((fn or oci) and not sup) \
            and not (fn and nationality in ("indian", "india")):
        add("consistency_category_flags", "PASS", "LOW", "NRI / OCI / Foreign National flags are consistent.",
            "foreign_national")

    return results
