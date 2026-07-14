"""manual day override status column

Revision ID: 0047_manual_override_status
Revises: 0046_align_fm_codes
Create Date: 2026-06-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0047_manual_override_status"
down_revision = "0046_align_fm_codes"
branch_labels = None
depends_on = None

STATUS_TAG_PATTERN = r"^\[MANUAL_STATUS:(NORMAL|IZINLI|RESMI_TATIL|CALISMADI)\]"


def upgrade() -> None:
    manual_day_status = sa.Enum(
        "NORMAL",
        "IZINLI",
        "RESMI_TATIL",
        "CALISMADI",
        name="manual_day_status",
    )
    manual_day_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "manual_day_overrides",
        sa.Column(
            "status",
            manual_day_status,
            nullable=False,
            server_default=sa.text("'NORMAL'"),
        ),
    )

    # Old frontend embedded the status as a "[MANUAL_STATUS:X] reason" prefix in note;
    # move it into the real column and strip the tag from the note.
    op.execute(
        f"""
        UPDATE manual_day_overrides
        SET status = upper(substring(note from '(?i){STATUS_TAG_PATTERN}'))::manual_day_status,
            note = nullif(btrim(regexp_replace(note, '(?i){STATUS_TAG_PATTERN}\\s*', '')), '')
        WHERE note ~* '{STATUS_TAG_PATTERN}'
        """
    )
    # Tagless absent rows predate the status options; CALISMADI matches their old meaning.
    op.execute(
        "UPDATE manual_day_overrides SET status = 'CALISMADI' WHERE status = 'NORMAL' AND is_absent = true"
    )


def downgrade() -> None:
    op.drop_column("manual_day_overrides", "status")
    sa.Enum(name="manual_day_status").drop(op.get_bind(), checkfirst=True)
