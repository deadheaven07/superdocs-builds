import logging
from dataclasses import dataclass
from typing import Optional

import fitz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.domain.redaction import RedactionCandidate as DBRedactionCandidate
from app.domain.redaction import RedactionCategory, RedactionStatus
from app.services.superdocs_integration import SuperDocsIntegrationService
from app.services.superdocs_port import PIICategory, PIIDetectionResult
from app.services.superdocs_port import RedactionCandidate as SuperDocsRedactionCandidate

logger = logging.getLogger(__name__)
settings = get_settings()


def db_candidates_to_superdocs(
    candidates: list["DBRedactionCandidate"],
) -> list[SuperDocsRedactionCandidate]:
    """Convert DB redaction candidates to SuperDocs API candidates."""
    from app.services.superdocs_port import PIIEntity

    result = []
    for c in candidates:
        if c.status not in (RedactionStatus.APPROVED, RedactionStatus.APPLIED):
            continue
        entity = PIIEntity(
            category=_map_redaction_category(c.category),
            text=c.matched_text,
            page_number=c.page_number,
            start_offset=0,
            end_offset=len(c.matched_text),
            confidence=1.0,
            context_before=c.context_before or "",
            context_after=c.context_after or "",
        )
        result.append(
            SuperDocsRedactionCandidate(
                entity=entity,
                approved=True,
                approved_by=c.approval.approver if c.approval else "system",
                approved_at=c.approval.approved_at.isoformat()
                if c.approval and c.approval.approved_at
                else None,
            )
        )
    return result


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
    def __init__(self, superdocs: Optional["SuperDocsIntegrationService"] = None):
        self.superdocs = superdocs or SuperDocsIntegrationService()

    async def detect_pii_in_document(
        self,
        session: AsyncSession,
        document_id: str,
        categories: list["PIICategory"] | None = None,
    ) -> "PIIDetectionResult":
        """Detect PII in document using SuperDocs."""
        from app.domain.document import Document

        document = await session.get(Document, document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")
        return await self.superdocs.detect_pii(session, document, categories)

    async def create_redaction_candidates(
        self,
        session: AsyncSession,
        document_id: str,
        pii_result: "PIIDetectionResult",
    ) -> list["DBRedactionCandidate"]:
        """Create database redaction candidates from SuperDocs PII detection results."""
        from app.domain.document import Document

        document = await session.get(Document, document_id)
        if not document:
            raise ValueError(f"Document {document_id} not found")

        candidates = []
        for entity in pii_result.entities:
            db_candidate = DBRedactionCandidate(
                document_id=document.id,
                page_number=entity.page_number,
                category=self._map_pii_category(entity.category),
                matched_text=entity.text,
                context_before=entity.context_before,
                context_after=entity.context_after,
                x0=0,
                y0=0,
                x1=0,
                y1=0,
                status=RedactionStatus.PROPOSED,
            )
            candidates.append(db_candidate)

        return candidates

    async def reconcile_candidates(
        self,
        session: AsyncSession,
        document_id: str,
        candidates: list["DBRedactionCandidate"],
    ) -> tuple[list["DBRedactionCandidate"], int]:
        """Return (new_candidates, skipped_count) so repeated detection
        never duplicates existing candidates."""
        result = await session.execute(
            select(DBRedactionCandidate).where(DBRedactionCandidate.document_id == document_id)
        )
        existing_keys = {self._candidate_identity(c) for c in result.scalars().all()}

        created: list[DBRedactionCandidate] = []
        skipped = 0
        for candidate in candidates:
            key = self._candidate_identity(candidate)
            if key in existing_keys:
                skipped += 1
            else:
                created.append(candidate)
                existing_keys.add(key)

        return created, skipped

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

    def _map_pii_category(self, pii_category: "PIICategory") -> RedactionCategory:
        mapping = {
            PIICategory.SSN: RedactionCategory.SSN,
            PIICategory.EMAIL: RedactionCategory.EMAIL,
            PIICategory.PHONE: RedactionCategory.PHONE,
            PIICategory.ACCOUNT_NUMBER: RedactionCategory.ACCOUNT_NUMBER,
            PIICategory.MEDICAL_TERM: RedactionCategory.MEDICAL_TERM,
            PIICategory.NAME: RedactionCategory.NAME,
            PIICategory.ADDRESS: RedactionCategory.ADDRESS,
            PIICategory.DATE_OF_BIRTH: RedactionCategory.OTHER,
            PIICategory.CREDIT_CARD: RedactionCategory.OTHER,
            PIICategory.DRIVERS_LICENSE: RedactionCategory.OTHER,
            PIICategory.PASSPORT: RedactionCategory.OTHER,
            PIICategory.OTHER: RedactionCategory.OTHER,
        }
        return mapping.get(pii_category, RedactionCategory.OTHER)


class RedactionApplicationService:
    def __init__(self, superdocs: Optional["SuperDocsIntegrationService"] = None):
        self.superdocs = superdocs or SuperDocsIntegrationService()

    async def apply_redactions(
        self,
        session: AsyncSession,
        document,
        candidates: list["DBRedactionCandidate"],
    ) -> dict:
        """Apply redactions using SuperDocs."""
        from app.domain.document import Document
        from app.domain.redaction import RedactionStatus

        document = await session.get(Document, document.id)
        if not document:
            raise ValueError("Document not found")

        superdocs_candidates = db_candidates_to_superdocs(candidates)

        if not superdocs_candidates:
            return {}

        result = await self.superdocs.apply_redactions(session, document, superdocs_candidates)

        verification_results = {}
        for c in candidates:
            if c.status in (RedactionStatus.APPROVED, RedactionStatus.APPLIED):
                verification_results[str(c.id)] = {
                    "applied": True,
                    "page": c.page_number,
                    "job_id": result.job_id,
                }
            else:
                verification_results[str(c.id)] = {
                    "applied": False,
                    "error": "Candidate not approved",
                }

        return verification_results

    async def verify_redactions(
        self,
        session: AsyncSession,
        document,
        candidates: list["DBRedactionCandidate"],
    ) -> dict:
        """Verify redactions were applied by scanning the exported redacted PDF.

        In the SuperDocs-native workflow redactions are applied server-side and
        the redacted artifact is exported back into working storage; this method
        re-scans that artifact so the packet-build gate can refuse to assemble a
        packet that still exposes redacted text.
        """
        from app.services.storage import redacted_pdf_path_for

        verification_results = {}
        redacted_path = redacted_pdf_path_for(document)
        pdf_text = ""
        if redacted_path.exists():
            redacted_doc = fitz.open(redacted_path)
            try:
                pdf_text = "".join(page.get_text() for page in redacted_doc)
            finally:
                redacted_doc.close()

        for c in candidates:
            if c.status != RedactionStatus.APPLIED:
                verification_results[str(c.id)] = {
                    "verified": False,
                    "text_still_present": True,
                }
                continue
            text_present = bool(c.matched_text) and c.matched_text.lower() in pdf_text.lower()
            verification_results[str(c.id)] = {
                "verified": not text_present,
                "text_still_present": text_present,
            }
        return verification_results


def _map_redaction_category(category: RedactionCategory) -> "PIICategory":
    mapping = {
        RedactionCategory.SSN: PIICategory.SSN,
        RedactionCategory.EMAIL: PIICategory.EMAIL,
        RedactionCategory.PHONE: PIICategory.PHONE,
        RedactionCategory.ACCOUNT_NUMBER: PIICategory.ACCOUNT_NUMBER,
        RedactionCategory.MEDICAL_TERM: PIICategory.MEDICAL_TERM,
        RedactionCategory.NAME: PIICategory.NAME,
        RedactionCategory.ADDRESS: PIICategory.ADDRESS,
        RedactionCategory.OTHER: PIICategory.OTHER,
    }
    return mapping.get(category, PIICategory.OTHER)
