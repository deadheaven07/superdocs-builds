import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.domain.bates import BatesAssignment
from app.domain.document import Document, ProcessingStatus
from app.domain.packet import Packet
from app.domain.page import Page
from app.services.bates_journal import BatesJournal, JournalEntry
from app.time import utc_now

settings = get_settings()


def format_bates_number(prefix: str, number: int, padding: int) -> str:
    return f"{prefix}{str(number).zfill(padding)}"


def parse_bates_number(bates_label: str, prefix: str) -> tuple[str, int]:
    if not bates_label.startswith(prefix):
        raise ValueError(f"Bates label {bates_label} does not match prefix {prefix}")
    number_str = bates_label[len(prefix) :]
    try:
        return prefix, int(number_str)
    except ValueError:
        raise ValueError(f"Invalid Bates number format: {bates_label}") from None


class BatesAssignmentService:
    async def assign_bates(
        self,
        session: AsyncSession,
        packet_id: str | uuid.UUID,
    ) -> list[BatesAssignment]:
        """Assign Bates numbers to all completed documents in display order.

        Full reassignment: existing assignments for the packet are replaced,
        so reorder/removal never leaves stale numbers or gaps. Every
        assignment is fsync'd into the packet journal before the next page is
        numbered — a crash mid-run resumes safely (never double-stamps) and
        the final sequence can be proven gap-free via
        ``BatesJournal.prove_continuity``.
        """
        packet = await session.get(Packet, packet_id)
        if not packet:
            raise ValueError(f"Packet {packet_id} not found")

        existing = await session.execute(
            select(BatesAssignment).where(BatesAssignment.packet_id == packet_id)
        )
        for assignment in existing.scalars().all():
            await session.delete(assignment)
        await session.flush()

        documents_result = await session.execute(
            select(Document)
            .where(Document.packet_id == packet_id)
            .where(Document.processing_status == ProcessingStatus.COMPLETED)
            .order_by(Document.display_order)
        )
        documents: Sequence[Document] = documents_result.scalars().all()

        journal = BatesJournal(settings.working_path / f"bates_journal_{packet_id}.jsonl")
        assignments = []
        next_number = packet.bates_start_number

        for document in documents:
            pages_result = await session.execute(
                select(Page).where(Page.document_id == document.id).order_by(Page.page_number)
            )
            pages: Sequence[Page] = pages_result.scalars().all()

            for page in pages:
                bates_label = format_bates_number(
                    packet.bates_prefix, next_number, packet.bates_padding
                )
                assignment = BatesAssignment(
                    packet_id=packet_id,
                    document_id=document.id,
                    page_id=page.id,
                    page_number=page.page_number,
                    bates_number=next_number,
                    bates_label=bates_label,
                )
                session.add(assignment)
                assignments.append(assignment)
                journal.append(
                    JournalEntry(
                        page_key=f"{document.id}:p{page.page_number}",
                        document_id=str(document.id),
                        page_number=page.page_number,
                        bates_number=next_number,
                        bates_label=bates_label,
                        assigned_at=utc_now().isoformat(),
                    )
                )
                next_number += 1

        await session.commit()
        return assignments

    async def get_bates_assignments(
        self,
        session: AsyncSession,
        packet_id: str | uuid.UUID,
    ) -> list[BatesAssignment]:
        result = await session.execute(
            select(BatesAssignment)
            .where(BatesAssignment.packet_id == packet_id)
            .order_by(BatesAssignment.bates_number)
        )
        return list(result.scalars().all())

    async def preview_bates(
        self,
        session: AsyncSession,
        packet_id: str | uuid.UUID,
    ) -> list[dict]:
        packet = await session.get(Packet, packet_id)
        if not packet:
            raise ValueError(f"Packet {packet_id} not found")

        documents_result = await session.execute(
            select(Document).where(Document.packet_id == packet_id).order_by(Document.display_order)
        )
        documents: Sequence[Document] = documents_result.scalars().all()

        preview = []
        current_number = packet.bates_start_number

        for document in documents:
            if document.processing_status != ProcessingStatus.COMPLETED:
                preview.append(
                    {
                        "document_id": str(document.id),
                        "document_name": document.original_filename,
                        "page_count": document.page_count,
                        "status": document.processing_status.value,
                        "bates_start": None,
                        "bates_end": None,
                        "skipped": True,
                    }
                )
                continue

            bates_start = format_bates_number(
                packet.bates_prefix, current_number, packet.bates_padding
            )
            current_number += document.page_count
            bates_end = format_bates_number(
                packet.bates_prefix, current_number - 1, packet.bates_padding
            )

            preview.append(
                {
                    "document_id": str(document.id),
                    "document_name": document.original_filename,
                    "page_count": document.page_count,
                    "status": document.processing_status.value,
                    "bates_start": bates_start,
                    "bates_end": bates_end,
                    "skipped": False,
                }
            )

        return preview
