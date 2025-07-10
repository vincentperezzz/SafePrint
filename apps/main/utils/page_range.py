def parse_page_ranges(page_range_str, total_pages):
    """
    Parses a string like '1,2-5,7-10' and returns a sorted list of unique zero-based page indices.
    total_pages: total number of pages in the document (to clamp ranges)
    """
    pages = set()
    for part in page_range_str.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-')
            try:
                start = int(start)
                end = int(end)
                for i in range(start, end + 1):
                    if 1 <= i <= total_pages:
                        pages.add(i - 1)  # zero-based
            except ValueError:
                continue
        else:
            try:
                i = int(part)
                if 1 <= i <= total_pages:
                    pages.add(i - 1)
            except ValueError:
                continue
    return sorted(pages)
