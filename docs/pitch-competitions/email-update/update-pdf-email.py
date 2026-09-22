from io import BytesIO
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

source = "/Users/villedajr/Downloads/SpotLift Pitch Deck 1.0.7.pdf"
render = "/Users/villedajr/SpotLift/tmp/pdfs/spotlift-user-final/page-7.png"
output = "/Users/villedajr/SpotLift/docs/pitch-competitions/output/SpotLift-Pitch-Deck-1.0.7.pdf"

reader = PdfReader(source)
page = reader.pages[6]
page_w = float(page.mediabox.width)
page_h = float(page.mediabox.height)
image = Image.open(render).convert("RGB")

# Cover only the previous contact line. The source background is a vertical
# gradient, so sampling each row immediately to the left preserves it closely.
x0, x1 = 645.0, 935.0
top, bottom = 425.0, 465.0
buf = BytesIO()
c = canvas.Canvas(buf, pagesize=(page_w, page_h))
for row in range(int(top), int(bottom) + 1):
    sample_x = int(610 / page_w * image.width)
    sample_y = min(image.height - 1, int(row / page_h * image.height))
    r, g, b = image.getpixel((sample_x, sample_y))
    c.setFillColorRGB(r / 255, g / 255, b / 255)
    pdf_y = page_h - row - 1
    c.rect(x0, pdf_y, x1 - x0, 1.5, stroke=0, fill=1)

c.setFillColorRGB(0, 0, 0)
c.setFont("Helvetica-Bold", 12)
c.drawRightString(920, page_h - 452, "Adan Villeda · coachlift71@gmail.com")
c.save()

overlay = PdfReader(BytesIO(buf.getvalue())).pages[0]
page.merge_page(overlay)
writer = PdfWriter()
for item in reader.pages:
    writer.add_page(item)
with open(output, "wb") as stream:
    writer.write(stream)
