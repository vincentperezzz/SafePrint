import io
from pdf2image import convert_from_path
from PIL import Image

# Helper to determine if a pixel is colored (not grayscale)
def is_colored_pixel(pixel, threshold=10):
    r, g, b = pixel[:3]
    return abs(r - g) > threshold or abs(r - b) > threshold or abs(g - b) > threshold

def analyze_pdf_colors(pdf_path, dpi=100):
    """
    Returns a list of dicts per page: { 'bw': bool, 'partial': bool, 'full_color': bool, 'color_ratio': float }
    """
    pages = convert_from_path(pdf_path, dpi=dpi)
    results = []
    for page in pages:
        img = page.convert('RGB')
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
    """
    color_results: output from analyze_pdf_colors
    gsm: 70 or 80
    Returns total cost and breakdown per page.
    """
    costs = []
    gsm_add = 1 if gsm == 70 else 2 if gsm == 80 else 0
    for res in color_results:
        if res['bw'] or res['partial']:
            base = 2
        else:
            base = 5
        costs.append(base + gsm_add)
    total = sum(costs)
    return total, costs
