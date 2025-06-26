import fitz  # PyMuPDF
from PIL import Image
import io

# Helper to determine if a pixel is colored (not grayscale)
def is_colored_pixel(pixel, threshold=10):
    r, g, b = pixel[:3]
    return abs(r - g) > threshold or abs(r - b) > threshold or abs(g - b) > threshold

def analyze_pdf_colors(pdf_path, dpi=100):
    """
    Returns a list of dicts per page: { 'bw': bool, 'partial': bool, 'full_color': bool, 'color_ratio': float }
    """
    doc = fitz.open(pdf_path)
    results = []
    for page in doc:
        # Render page to a pixmap (image)
        pix = page.get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        pixels = img.getdata()
        total = len(pixels)
        color_count = sum(1 for px in pixels if is_colored_pixel(px))
        color_ratio = color_count / total
        if color_ratio > 0.10:
            results.append({'bw': False, 'partial': False, 'full_color': True, 'color_ratio': color_ratio})
        elif color_ratio > 0:
            results.append({'bw': False, 'partial': True, 'full_color': False, 'color_ratio': color_ratio})
        else:
            results.append({'bw': True, 'partial': False, 'full_color': False, 'color_ratio': 0.0})
    return results

def calculate_page_costs(color_results, gsm=70):
    costs = []
    for page in color_results:
        if page.get('bw') or page.get('partial'):
            costs.append(2)
        else:  # full_color
            costs.append(5)
    print("==================================================")
    print("Costs per page:", costs)
    print("Total pages:", len(costs))
    print("Total cost:", sum(costs))
    print("==================================================")
    return sum(costs), costs
