import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import fitz

from sqlalchemy import select

from app.config import get_settings
from app.domain.redaction import RedactionCandidate, RedactionCategory, RedactionStatus
from app.services.storage import base_pdf_source

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class RedactionMatch:
    category: RedactionCategory
    matched_text: str
    context_before: str
    context_after: str
    page_number: int
    x0: float
    y0: float
    x1: float
    y1: float


class RedactionDetectionService:
    PATTERNS = {
        RedactionCategory.SSN: [
            r'\b\d{3}-\d{2}-\d{4}\b',
            r'\b\d{3}\s\d{2}\s\d{4}\b',
            r'\b\d{9}\b',
        ],
        RedactionCategory.EMAIL: [
            r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        ],
        RedactionCategory.PHONE: [
            r'\b\d{3}-\d{3}-\d{4}\b',
            r'\(\d{3}\)\s*\d{3}-\d{4}',
            r'\b\d{10}\b',
        ],
        RedactionCategory.ACCOUNT_NUMBER: [
            r'\b\d{10,16}\b',
            r'\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b',
            r'\b(?:ACCT|ACCOUNT|ACC)[-\s]*\d{3,6}[-\s]*\d{3,6}\b',
        ],
        RedactionCategory.MEDICAL_TERM: [
            r'\b(diagnosis|prognosis|treatment|medication|prescription|patient|clinical|hospital|physician|therapy|symptom|disease|condition|disorder|syndrome|cancer|tumor|diabetes|hypertension|heart disease|stroke|infection|allergy|surgery|procedure|test|lab|x-ray|MRI|CT scan|ultrasound|blood|urine|biopsy|pathology|radiology|oncology|cardiology|neurology|psychiatry)\b',
        ],
    }

    NAME_PATTERN = re.compile(
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b'
    )

    def __init__(self):
        self.compiled_patterns = {
            category: [re.compile(p, re.IGNORECASE) for p in patterns]
            for category, patterns in self.PATTERNS.items()
        }

    def detect_in_text(self, text: str, page_number: int) -> List[RedactionMatch]:
        matches = []

        for category, patterns in self.compiled_patterns.items():
            for pattern in patterns:
                for match in pattern.finditer(text):
                    start, end = match.span()
                    context_before = text[max(0, start - 50):start].strip()
                    context_after = text[end:min(len(text), end + 50)].strip()

                    matches.append(RedactionMatch(
                        category=category,
                        matched_text=match.group(),
                        context_before=context_before,
                        context_after=context_after,
                        page_number=page_number,
                        x0=0, y0=0, x1=0, y1=0,
                    ))

        for match in self.NAME_PATTERN.finditer(text):
            name = match.group(1)
            if self._is_likely_name(name):
                start, end = match.span()
                context_before = text[max(0, start - 50):start].strip()
                context_after = text[end:min(len(text), end + 50)].strip()

                matches.append(RedactionMatch(
                    category=RedactionCategory.NAME,
                    matched_text=name,
                    context_before=context_before,
                    context_after=context_after,
                    page_number=page_number,
                    x0=0, y0=0, x1=0, y1=0,
                ))

        return matches

    def _is_likely_name(self, name: str) -> bool:
        parts = name.split()
        if len(parts) < 2 or len(parts) > 4:
            return False
        common_words = {'The', 'And', 'Or', 'But', 'For', 'With', 'From', 'To', 'In', 'On', 'At', 'By', 'Of', 'A', 'An'}
        if any(part in common_words for part in parts):
            return False
        first_word = parts[0]
        document_tokens = {
            'Page', 'Section', 'Chapter', 'Figure', 'Table', 'Appendix',
            'Exhibit', 'Step', 'Item', 'Part', 'Unit', 'Column', 'Row',
            'Exhibit', 'Schedule', 'Clause', 'Heading', 'Index',
        }
        if first_word in document_tokens:
            return False
        privilege_markers = {
            'Attorney', 'Client', 'Counsel', 'Legal', 'Privileged',
            'Privilege', 'Confidential',
        }
        if any(part in privilege_markers for part in parts):
            return False
        return True

    def _extract_lines(self, page: fitz.Page) -> List[tuple[str, list]]:
        """Return (line_text, [(char_start, char_end, fitz.Rect), ...]) per text line."""
        words = page.get_text("words")
        groups = {}
        for word in words:
            block_no = word[5]
            line_no = word[6]
            groups.setdefault((block_no, line_no), []).append(word)

        lines = []
        for key in sorted(groups):
            group = sorted(groups[key], key=lambda w: (w[7], w[0]))
            text = ""
            spans = []
            for word in group:
                if text:
                    text += " "
                start = len(text)
                text += word[4]
                spans.append((start, len(text), fitz.Rect(word[0], word[1], word[2], word[3])))
            lines.append((text, spans))
        return lines

    def _rect_for_span(self, spans: list, start: int, end: int) -> Optional[fitz.Rect]:
        rects = [rect for (s, e, rect) in spans if s < end and e > start]
        if not rects:
            return None
        rect = fitz.Rect()
        for r in rects:
            rect |= r
        return rect

    def detect_in_pdf(self, pdf_path: Path) -> List[RedactionMatch]:
        all_matches = []
        try:
            doc = fitz.open(pdf_path)
            for page_num in range(len(doc)):
                page = doc[page_num]

                for line_text, spans in self._extract_lines(page):
                    matches = self.detect_in_text(line_text, page_num + 1)

                    last_find = {}
                    for match in matches:
                        start_index = last_find.get(match.matched_text, 0)
                        index = line_text.find(match.matched_text, start_index)
                        if index == -1:
                            index = line_text.find(match.matched_text)
                        if index == -1:
                            continue
                        last_find[match.matched_text] = index + 1

                        rect = self._rect_for_span(spans, index, index + len(match.matched_text))
                        if rect is None:
                            instances = page.search_for(match.matched_text)
                            if instances:
                                rect = instances[0]
                        if rect is not None:
                            match.x0 = rect.x0
                            match.y0 = rect.y0
                            match.x1 = rect.x1
                            match.y1 = rect.y1

                    all_matches.extend(matches)

            doc.close()
        except Exception as e:
            logger.error(f"Error detecting redactions in PDF: {e}")
        return all_matches

    async def create_redaction_candidates(
        self,
        session,
        document,
    ) -> List[RedactionCandidate]:
        source_path = base_pdf_source(document)
        if source_path is None:
            return []

        matches = self.detect_in_pdf(source_path)

        candidates = []
        for match in matches:
            candidate = RedactionCandidate(
                document_id=document.id,
                page_number=match.page_number,
                category=match.category,
                matched_text=match.matched_text,
                context_before=match.context_before,
                context_after=match.context_after,
                x0=match.x0,
                y0=match.y0,
                x1=match.x1,
                y1=match.y1,
            )
            candidates.append(candidate)

        return candidates

    @staticmethod
    def _candidate_identity(candidate) -> tuple:
        return (
            candidate.document_id,
            candidate.page_number,
            candidate.category,
            candidate.matched_text,
            candidate.x0,
            candidate.y0,
            candidate.x1,
            candidate.y1,
        )

    async def reconcile_candidates(
        self,
        session,
        document,
        candidates: List[RedactionCandidate],
    ) -> tuple[List[RedactionCandidate], int]:
        """Return (new_candidates, skipped_count) so repeated detection never
        duplicates existing candidates, regardless of their status."""
        result = await session.execute(
            select(RedactionCandidate).where(RedactionCandidate.document_id == document.id)
        )
        existing_keys = {
            self._candidate_identity(c) for c in result.scalars().all()
        }

        created: List[RedactionCandidate] = []
        skipped = 0
        for candidate in candidates:
            key = self._candidate_identity(candidate)
            if key in existing_keys:
                skipped += 1
            else:
                created.append(candidate)
                existing_keys.add(key)

        return created, skipped


class RedactionApplicationService:
    def __init__(self):
        pass

    def apply_redactions(
        self,
        input_path: Path,
        output_path: Path,
        candidates: List[RedactionCandidate],
    ) -> dict:
        verification_results = {}
        target = [
            c for c in candidates
            if c.status in (RedactionStatus.APPROVED, RedactionStatus.APPLIED)
        ]
        attempted_ids = [str(c.id) for c in target]
        doc = None
        tmp_path = None

        try:
            doc = fitz.open(input_path)

            by_page = {}
            for candidate in target:
                page_number = candidate.page_number
                if page_number < 1 or page_number > len(doc):
                    verification_results[str(candidate.id)] = {
                        "applied": False,
                        "error": f"Page {page_number} not found",
                    }
                    continue

                page = doc[page_number - 1]
                if candidate.x0 or candidate.y0 or candidate.x1 or candidate.y1:
                    rect = fitz.Rect(candidate.x0, candidate.y0, candidate.x1, candidate.y1)
                else:
                    text_instances = page.search_for(candidate.matched_text)
                    if not text_instances:
                        verification_results[str(candidate.id)] = {
                            "applied": False,
                            "error": "Text not found on page",
                        }
                        continue
                    rect = text_instances[0]

                by_page.setdefault(page_number - 1, []).append((candidate, rect))

            for page_index, items in by_page.items():
                page = doc[page_index]
                for candidate, rect in items:
                    page.add_redact_annot(rect, fill=(0, 0, 0))
                page.apply_redactions()
                for candidate, rect in items:
                    verification_results[str(candidate.id)] = {
                        "applied": True,
                        "page": candidate.page_number,
                        "coordinates": [rect.x0, rect.y0, rect.x1, rect.y1],
                    }

            output_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = output_path.with_name(output_path.name + ".tmp")
            doc.save(tmp_path, garbage=4, deflate=True)
            doc.close()
            doc = None
            os.replace(tmp_path, output_path)
            tmp_path = None

        except Exception as e:
            logger.error(f"Error applying redactions: {e}")
            if doc is not None:
                try:
                    doc.close()
                except Exception:
                    pass
            if tmp_path is not None:
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass
            for candidate_id in attempted_ids:
                verification_results[candidate_id] = {
                    "applied": False,
                    "error": str(e),
                }

        return verification_results

    def verify_redactions(
        self,
        pdf_path: Path,
        candidates: List[RedactionCandidate],
    ) -> dict:
        verification_results = {}

        try:
            doc = fitz.open(pdf_path)
            full_text = "".join(page.get_text() for page in doc).lower()
            doc.close()

            for candidate in candidates:
                found = candidate.matched_text.lower() in full_text
                verification_results[str(candidate.id)] = {
                    "verified": not found,
                    "text_still_present": found,
                }

        except Exception as e:
            logger.error(f"Error verifying redactions: {e}")
            for candidate in candidates:
                verification_results[str(candidate.id)] = {
                    "verified": False,
                    "error": str(e),
                }

        return verification_results