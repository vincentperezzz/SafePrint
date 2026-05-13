import fitz  # PyMuPDF
from PIL import Image
import io

# Helper to determine if a pixel is colored (not grayscale)
def is_colored_pixel(pixel, threshold=10):
    r, g, b = pixel[:3]
    return abs(r - g) > threshold or abs(r - b) > threshold or abs(g - b) > threshold

def analyze_pdf_colors(pdf_path, dpi=100, page_indices=None, full_color_threshold_percent=10):
    """
    Returns a list of dicts per page: { 'bw': bool, 'partial': bool, 'full_color': bool, 'color_ratio': float }
    If page_indices is provided, only those pages are scanned (0-based).
    """
    doc = fitz.open(pdf_path)
    results = []
    full_color_threshold_ratio = max(float(full_color_threshold_percent or 0), 0.0) / 100.0
    if page_indices is None:
        page_indices = range(len(doc))
    for i in page_indices:
        page = doc[i]
        # Render page to a pixmap (image)
        pix = page.get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        pixels = img.getdata()
        total = len(pixels)
        color_count = sum(1 for px in pixels if is_colored_pixel(px))
        color_ratio = color_count / total
        if color_ratio >= full_color_threshold_ratio and color_ratio > 0:
            results.append({'bw': False, 'partial': False, 'full_color': True, 'color_ratio': color_ratio})
        elif color_ratio > 0:
            results.append({'bw': False, 'partial': True, 'full_color': False, 'color_ratio': color_ratio})
        else:
            results.append({'bw': True, 'partial': False, 'full_color': False, 'color_ratio': 0.0})
    return results

# Pricing defaults
PRICE_LETTER_BW = 1
PRICE_LETTER_PARTIAL = 3
PRICE_LETTER_FULL = 8
PRICE_A4_BW = 1
PRICE_A4_PARTIAL = 3
PRICE_A4_FULL = 8
PRICE_LONG_BW = 2
PRICE_LONG_PARTIAL = 4
PRICE_LONG_FULL = 10


def _paper_pricing_key(paper_size):
    normalized = str(paper_size or '').strip().lower()
    if normalized == 'long':
        return 'long'
    if normalized == 'a4':
        return 'a4'
    return 'letter'

def calculate_page_costs(
    color_results,
    paper_size='Letter',
    color_mode='Color',
    num_copies=1,
    letter_bw_price=PRICE_LETTER_BW,
    letter_partial_price=PRICE_LETTER_PARTIAL,
    letter_full_price=PRICE_LETTER_FULL,
    a4_bw_price=PRICE_A4_BW,
    a4_partial_price=PRICE_A4_PARTIAL,
    a4_full_price=PRICE_A4_FULL,
    long_bw_price=PRICE_LONG_BW,
    long_partial_price=PRICE_LONG_PARTIAL,
    long_full_price=PRICE_LONG_FULL,
):
    """
    Calculates per-page costs based on color analysis, paper size, and color mode.
    Factors in the number of copies requested.
    """
    costs = []
    num_copies = int(num_copies) if num_copies else 1  # Ensure num_copies is at least 1
    pricing_key = _paper_pricing_key(paper_size)
    price_matrix = {
        'letter': {
            'bw': letter_bw_price,
            'partial': letter_partial_price,
            'full': letter_full_price,
        },
        'a4': {
            'bw': a4_bw_price,
            'partial': a4_partial_price,
            'full': a4_full_price,
        },
        'long': {
            'bw': long_bw_price,
            'partial': long_partial_price,
            'full': long_full_price,
        },
    }
    selected_prices = price_matrix[pricing_key]
    
    if color_mode != 'Color':
        # B&W pricing logic
        bw_price = selected_prices['bw']
        costs = [bw_price] * len(color_results)
    else:
        for page in color_results:
            if page.get('full_color'):
                costs.append(selected_prices['full'])
            elif page.get('partial'):
                costs.append(selected_prices['partial'])
            else:  # pure B&W in color mode
                costs.append(selected_prices['bw'])
    
    # Calculate single copy cost and total cost
    single_copy_cost = sum(costs)
    total_cost = single_copy_cost * num_copies
    
    print("==================================================")
    print("Costs per page:", costs)
    print("Total pages:", len(costs))
    print(f"Number of copies: {num_copies}")
    print(f"Total cost: ₱{total_cost}")
    print("==================================================")
    
    return total_cost, costs