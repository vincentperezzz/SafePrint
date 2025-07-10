import fitz  # PyMuPDF
from PIL import Image
import io

# Helper to determine if a pixel is colored (not grayscale)
def is_colored_pixel(pixel, threshold=10):
    r, g, b = pixel[:3]
    return abs(r - g) > threshold or abs(r - b) > threshold or abs(g - b) > threshold

def analyze_pdf_colors(pdf_path, dpi=100, page_indices=None):
    """
    Returns a list of dicts per page: { 'bw': bool, 'partial': bool, 'full_color': bool, 'color_ratio': float }
    If page_indices is provided, only those pages are scanned (0-based).
    """
    doc = fitz.open(pdf_path)
    results = []
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
        if color_ratio > 0.10:
            results.append({'bw': False, 'partial': False, 'full_color': True, 'color_ratio': color_ratio})
        elif color_ratio > 0:
            results.append({'bw': False, 'partial': True, 'full_color': False, 'color_ratio': color_ratio})
        else:
            results.append({'bw': True, 'partial': False, 'full_color': False, 'color_ratio': 0.0})
    return results

# Pricing variables for easy changes
PRICE_BW_70 = 1
PRICE_BW_80 = 2
PRICE_COLOR_PARTIAL = 2  # <10% colored pixels
PRICE_COLOR_FULL = 5     # Full RGB

def calculate_page_costs(color_results, gsm=70, color_mode='Color', num_copies=1):
    """
    Calculates per-page costs based on color analysis, GSM, and color mode.
    Factors in the number of copies requested.
    """
    costs = []
    gsm = int(gsm)
    num_copies = int(num_copies) if num_copies else 1  # Ensure num_copies is at least 1
    
    if color_mode != 'Color':
        # B&W pricing logic
        bw_price = PRICE_BW_70 if gsm == 70 else PRICE_BW_80
        costs = [bw_price] * len(color_results)
    else:
        for page in color_results:
            if page.get('full_color'):
                costs.append(PRICE_COLOR_FULL)
            elif page.get('partial'):
                costs.append(PRICE_COLOR_PARTIAL)
            else:  # pure B&W in color mode
                bw_price = PRICE_BW_70 if gsm == 70 else PRICE_BW_80
                costs.append(bw_price)
    
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