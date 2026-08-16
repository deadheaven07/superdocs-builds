"""Safety tests: prove that rejected redactions leave source files byte-identical.

When a reviewer rejects 100% of proposed redactions, the source files must
remain bit-for-bit unchanged.  The scrubber always reads from the pristine
base and writes to a separate output — the source is never modified.
"""

import hashlib
import tempfile
from pathlib import Path

import fitz
import pytest

from app.domain.redaction import RedactionCandidate, RedactionCategory, RedactionStatus
from app.services.redaction_scrubber import RedactionByteScrubber, RedactionVerifier


def _make_candidate(
    text: str,
    page: int = 1,
    status: RedactionStatus = RedactionStatus.PROPOSED,
) -> RedactionCandidate:
    return RedactionCandidate(
        id="test-id",
        document_id="test-doc",
        page_number=page,
        category=RedactionCategory.SSN,
        matched_text=text,
        context_before="",
        context_after="",
        x0=0, y0=0, x1=0, y1=0,
        status=status,
    )


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


class TestRejectionSafety:
    """When all redactions are rejected, source files remain byte-identical.

    The scrubber reads from the pristine base PDF and writes to a separate
    output path.  The source is never opened for write — this is the core
    safety invariant.
    """

    def test_source_unchanged_after_scrub(self):
        """After scrubbing, the source PDF is byte-identical to before."""
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source.pdf"
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((50, 100), "SSN: 123-45-6789", fontsize=12)
            doc.save(str(source))
            doc.close()

            original_sha = _sha256(source)
            original_bytes = source.read_bytes()

            candidates = [_make_candidate("123-45-6789", status=RedactionStatus.APPROVED)]
            scrubber = RedactionByteScrubber()
            output = Path(tmpdir) / "output.pdf"
            scrubber.scrub(source, candidates, output)

            # Source file is byte-identical
            assert _sha256(source) == original_sha
            assert source.read_bytes() == original_bytes

    def test_source_unchanged_with_rejected_candidates(self):
        """When all candidates are PROPOSED (rejected), source is unchanged."""
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source.pdf"
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((50, 100), "SSN: 123-45-6789", fontsize=12)
            doc.save(str(source))
            doc.close()

            original_sha = _sha256(source)

            candidates = [_make_candidate("123-45-6789", status=RedactionStatus.PROPOSED)]
            scrubber = RedactionByteScrubber()
            output = Path(tmpdir) / "output.pdf"
            scrubber.scrub(source, candidates, output)

            assert _sha256(source) == original_sha

    def test_empty_candidates_source_unchanged(self):
        """With zero candidates, the source is never modified."""
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source.pdf"
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((50, 100), "Email: test@example.com", fontsize=12)
            doc.save(str(source))
            doc.close()

            original_sha = _sha256(source)
            output = Path(tmpdir) / "output.pdf"

            scrubber = RedactionByteScrubber()
            with pytest.raises(ValueError, match="No candidates to scrub"):
                scrubber.scrub(source, [], output)

            assert _sha256(source) == original_sha

    def test_only_approved_candidates_scrubbed_in_output(self):
        """In the output PDF, only approved candidate text is removed."""
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source.pdf"
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((50, 80), "SSN: 123-45-6789", fontsize=12)
            page.insert_text((50, 200), "Name: John Smith", fontsize=12)
            doc.save(str(source))
            doc.close()

            candidates = [
                _make_candidate("123-45-6789", status=RedactionStatus.APPROVED),
                _make_candidate("John Smith", status=RedactionStatus.REJECTED),
            ]

            scrubber = RedactionByteScrubber()
            output = Path(tmpdir) / "output.pdf"
            result = scrubber.scrub(source, candidates, output)

            assert result.rects_applied >= 1
            assert output.exists()

            # Source is untouched
            assert _sha256(source) == _sha256(source)

            # Output has scrubbed SSN
            out_doc = fitz.open(str(output))
            try:
                out_text = "".join(p.get_text() for p in out_doc)
            finally:
                out_doc.close()
            assert "123-45-6789" not in out_text


class TestRedactionVerifier:
    def test_verify_proves_text_removed(self):
        """After scrubbing, the verifier confirms text is gone."""
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source.pdf"
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((50, 100), "SSN: 123-45-6789", fontsize=12)
            doc.save(str(source))
            doc.close()

            candidate = _make_candidate("123-45-6789", status=RedactionStatus.APPROVED)
            scrubber = RedactionByteScrubber()
            output = Path(tmpdir) / "redacted.pdf"
            scrubber.scrub(source, [candidate], output)

            verifier = RedactionVerifier()
            results = verifier.verify_pdf(output, [candidate])

            assert results[str(candidate.id)]["verified"] is True
            assert results[str(candidate.id)]["text_still_present"] is False

    def test_verify_catches_missing_file(self):
        """Verifier returns failure for a non-existent redacted file."""
        candidate = _make_candidate("123-45-6789")
        verifier = RedactionVerifier()
        results = verifier.verify_pdf(Path("/nonexistent.pdf"), [candidate])

        assert results[str(candidate.id)]["verified"] is False
        assert "missing" in results[str(candidate.id)].get("error", "")
