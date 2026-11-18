"""Replace the scheduling-algorithm page of the illustrated schedule guide."""

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


GUIDE = Path(__file__).resolve().parents[1] / "public" / "schedule-instructions.pdf"


def main():
    reader = PdfReader(GUIDE)
    if len(reader.pages) != 8:
        raise ValueError("Expected the eight-page illustrated schedule guide.")

    original = reader.pages[3]
    original_text = original.extract_text()
    if "How the proposal is built" not in original_text and "How scheduling strategies work" not in original_text:
        raise ValueError("Page 4 is not the expected scheduling-algorithm page.")
    width, height = float(original.mediabox.width), float(original.mediabox.height)
    page = BytesIO()
    document = SimpleDocTemplate(
        page, pagesize=(width, height), leftMargin=48, rightMargin=48,
        topMargin=38, bottomMargin=38,
    )
    heading = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#183a36"))
    subheading = ParagraphStyle("subheading", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#183a36"))
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13)
    items = [
        (heading, "How scheduling strategies work"),
        (body, "Choose a strategy in the Shared schedule panel, then select Generate locally. Changing the selection alone does not regenerate the schedule."),
        (subheading, "Shared first step: fill meetings"),
        (body, "Both strategies try to fill as many meetings as possible with eligible ranked titles, before improving their other objectives. They use the final club ranking when available, otherwise the combined member ranking. Already-read titles are excluded. Locked assignments and other cycles are retained."),
        (body, "Slots are considered by month; within a month, clubs with greater historical satisfaction debt from published assignments go first. The search checks kit status, checked-out loans, history, repeated titles and overlapping loan windows including the turnaround buffer. A meeting without a fixed date uses the first Monday of its month, which must be after the preference deadline."),
        (subheading, "Prioritise clubs"),
        (body, "After filling meetings, this default strategy tries to improve the lowest club fairness score first, then the next lowest, without reducing coverage. It considers the club's preferred titles in rank order and favours its branch when choosing between kits of the same title. See page 5 for the fairness calculation."),
        (subheading, "Prioritise utilisation"),
        (body, "With equal coverage, this strategy seeks to use fewer distinct physical kits in the cycle. It next favours popular titles, then uses club fairness to break ties. Popularity sums the eligible rankings of clubs with meetings in this cycle: a first choice contributes 1, and rank r of N contributes (N - r + 1) / N. A physical kit used for several non-overlapping loans counts once; different kits of the same title count separately."),
        (body, "Locked kits count towards this cycle's usage; other-cycle assignments do not count towards it but still block conflicting loans. Less popular ranked titles can still be used. This strategy does not delete kits or guarantee that any kit can be removed from inventory."),
        (subheading, "What to expect"),
        (body, "Both strategies use bounded rearrangements, so results are practical proposals, not guaranteed global optima. Search-limit messages mean more improvements or filled meetings may be possible. Review unassigned slots and each club's fairness; utilisation may give a club a lower-ranked choice. Fairness uses the full scoring ranking, including previously read titles, even though generation excludes those titles."),
        (body, "Generating for one club only fills its empty meetings and keeps all existing assignments. The selected mode affects ranked order, and unread unranked titles can be used as fallback; it does not run the full-cycle optimisation."),
        (body, "Save draft shares the reviewed proposal; publishing is a separate step. Manual overrides can require warnings and may create infeasible schedules."),
    ]
    story = []
    for style, text in items:
        story.append(Paragraph(text, style))
        story.append(Spacer(1, 6 if style is body else 7))
    document.build(story)
    page.seek(0)
    replacement = PdfReader(page)
    if len(replacement.pages) != 1:
        raise ValueError("The replacement must fit on one page.")

    writer = PdfWriter()
    for index, original_page in enumerate(reader.pages):
        writer.add_page(replacement.pages[0] if index == 3 else original_page)
    output = BytesIO()
    writer.write(output)
    GUIDE.write_bytes(output.getvalue())


if __name__ == "__main__":
    main()
