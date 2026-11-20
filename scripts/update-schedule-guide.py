"""Update scheduling guidance while preserving the guide's illustrations."""

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer


GUIDE = Path(__file__).resolve().parents[1] / "public" / "schedule-instructions.pdf"


def main():
    reader = PdfReader(GUIDE)
    if len(reader.pages) != 8:
        raise ValueError("Expected the eight-page illustrated schedule guide.")

    if "How the proposal is built" not in reader.pages[3].extract_text() and "How scheduling strategies work" not in reader.pages[3].extract_text():
        raise ValueError("Page 4 is not the expected scheduling-algorithm page.")
    heading = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#183a36"))
    subheading = ParagraphStyle("subheading", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#183a36"))
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13)
    caption = ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=8, leading=10, textColor=colors.HexColor("#465c56"))

    def illustration(page_index, image_index, width):
        image = reader.pages[page_index].images[image_index]
        result = Image(BytesIO(image.data))
        result.drawHeight = result.imageHeight * width / result.imageWidth
        result.drawWidth = width
        result.hAlign = "LEFT"
        return result

    def page(items, original):
        output = BytesIO()
        document = SimpleDocTemplate(
            output, pagesize=(float(original.mediabox.width), float(original.mediabox.height)),
            leftMargin=48, rightMargin=48, topMargin=38, bottomMargin=38,
        )
        story = []
        for item in items:
            if isinstance(item, tuple):
                style, text = item
                story.append(Paragraph(text, style))
                story.append(Spacer(1, 6 if style is body else 7))
            else:
                story.append(item)
                story.append(Spacer(1, 5))
        document.build(story)
        output.seek(0)
        replacement = PdfReader(output)
        if len(replacement.pages) != 1:
            raise ValueError("Each replacement must fit on one page.")
        return replacement.pages[0]

    inspect = [
        (heading, "Find a club and meeting"),
        (body, "1. On Schedule, select Grid. Each row is a club and each cell is a month. Under the club name, read its fairness percentage and assigned / total slots."),
        (body, "2. Use Clubs shown, Show all, Hide all or a row's Hide button to select clubs. Hiding alone changes no assignments; full generation uses the clubs shown."),
        (body, "3. Scroll for later months. A cover represents an assigned title; a dashed Not assigned cell is a slot without a kit. A dash means no meeting slot in that month."),
        (body, "4. In a collecting or drafted cycle, tap a cover or Not assigned cell to open its editor. A red border and exclamation mark indicate a problem requiring review."),
        illustration(1, 0, 480),
        (caption, "2027 demo Grid; club name obscured. Screenshots show an earlier interface."),
        (subheading, "Use the other views to check details"),
        (body, "Choose Meetings for club-by-club assignments and unassigned slots; expand a meeting for kit and loan dates. Choose Kits to group assigned meetings by physical kit. Clubs shown filters all three views and their exports."),
        illustration(1, 1, 480),
        (caption, "Meetings view with a detail expanded; identifying labels obscured."),
    ]
    generate = [
        (heading, "Generate and review"),
        (body, "1. Choose a collecting or drafted cycle and select clubs in Clubs shown. In the Shared schedule panel, choose a strategy and tap Generate locally. At least one club must be shown."),
        (body, "2. Confirm replacement of shown clubs' dates and assignments, including locks. Current cadence, offset and meeting rules determine new dates. Hidden clubs' assignments are removed, but their meetings, dates and ballots remain."),
        illustration(2, 0, 480),
        (caption, "Earlier interface: start a local proposal. Save draft is disabled until there is a local change."),
        (body, "3. Review the Grid, messages, fairness and unassigned meetings. Confirmation identifies locked assignments and affected checked-out or reserved kits. A title highlight does not change Clubs shown."),
        illustration(2, 1, 480),
        (caption, "Earlier interface after local generation: regenerate, save the shared draft or discard the proposal."),
        (body, "Save draft shares the reviewed proposal, including hidden-club removals. Showing a club again does not restore its previous assignments. Every meeting must be assigned before publication."),
        (body, "A search-limit warning means further improvements may exist, not that the result is optimal or a gap impossible to fill. Discard changes abandons local work; changing cycle or leaving with unsaved work also prompts before discarding."),
    ]
    items = [
        (heading, "How scheduling strategies work"),
        (body, "Choose clubs in Clubs shown and a strategy in the Shared schedule panel, then select Generate locally. Hiding a club alone does not change its assignments."),
        (subheading, "Shared first step: fill meetings"),
        (body, "Both strategies fill meetings for shown clubs using eligible ranked titles. They use final club rankings when available, otherwise combined member rankings. Already-read titles are excluded. Other cycles remain availability constraints."),
        (body, "Full generation confirms and replaces shown clubs' slots, dates and assignments, including locks. Hidden clubs' assignments are removed locally; their slots, dates and ballots remain. Save draft shares changes. Show and assign every club's meetings before publication."),
        (body, "Slots are considered by month; within a month, clubs with greater historical satisfaction debt go first. The search checks kit status, loans, history and actual loan windows. Current club rules set replacement dates; dates on or before the deadline remain undated and unassigned. Other dates remain even without a kit."),
        (subheading, "Prioritise clubs"),
        (body, "After filling meetings, this default strategy tries to improve the lowest club fairness score first, then the next lowest, without reducing coverage. It considers the club's preferred titles in rank order and favours its branch when choosing between kits of the same title. See page 5 for the fairness calculation."),
        (subheading, "Prioritise utilisation"),
        (body, "With equal coverage, this strategy seeks to use fewer distinct physical kits in the cycle. It next favours popular titles, then uses club fairness to break ties. Popularity sums the eligible rankings of clubs with meetings in this cycle: a first choice contributes 1, and rank r of N contributes (N - r + 1) / N. A physical kit used for several non-overlapping loans counts once; different kits of the same title count separately."),
        (body, "Other-cycle assignments do not count towards cycle usage but still block conflicting loans. Less popular ranked titles can still be used. This strategy does not delete kits or guarantee that any kit can be removed from inventory."),
        (subheading, "What to expect"),
        (body, "Both strategies use bounded rearrangements, so results are practical proposals, not guaranteed global optima. Search-limit messages mean more improvements or filled meetings may be possible. Review unassigned slots and each club's fairness; utilisation may give a club a lower-ranked choice. Fairness uses the full scoring ranking, including previously read titles, even though generation excludes those titles."),
        (body, "Single-club generation reconciles cadence, then fills empty meetings. Six weeks skips one month per three, restarting each cycle; it is not exact six-week dates. For a January start, offsets 0, 1 and 2 skip Mar/Jun, Jan/Apr and Feb/May respectively. Monthly ignores the offset. Saving the club alone does not move meetings. The mode affects ranked order; unread unranked titles can be fallback."),
        (body, "Save draft shares the reviewed proposal; publishing is a separate step. Manual overrides can require warnings and may create infeasible schedules."),
    ]
    editor = [
        (heading, "Inspect or change a meeting"),
        (body, "1. In Grid, find the club and month, then tap its cover or Not assigned. The editor opens as a dialog; scroll inside it on a small screen."),
        (body, "2. Read Current assignment: title, kit barcode, branch, status, lock state and ready-to-due window. Red messages explain detected issues. Clear removes an unlocked assignment locally."),
        (body, "3. Tap Unlock locally before manually changing a locked assignment. Full regeneration replaces shown-club locks and removes hidden-club assignments, including locks, after confirmation."),
        (body, "4. Tap Choose a title and kit to open the picker. Follow the next page to compare kits and apply the selection. Changes remain local until a draft is saved."),
        illustration(5, 0, 430),
        (caption, "2027 meeting editor: clear, lock, and choose a title and kit. Club-identifying labels obscured."),
        (body, "Date rules: an undated slot defaults to its club's meeting rule. A fixed date is not editable here; changing the club rule alone does not move it, but full regeneration replaces it. Changing a slot on Cycles can remove its assignment, including locked or in-use assignments."),
    ]
    replacements = {1: page(inspect, reader.pages[1]), 2: page(generate, reader.pages[2]),
                    3: page(items, reader.pages[3]), 5: page(editor, reader.pages[5])}

    writer = PdfWriter()
    for index, original_page in enumerate(reader.pages):
        writer.add_page(replacements.get(index, original_page))
    output = BytesIO()
    writer.write(output)
    GUIDE.write_bytes(output.getvalue())


if __name__ == "__main__":
    main()
