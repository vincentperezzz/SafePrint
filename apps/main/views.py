import os
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from portal.models import SiteSetting
from .utils.pdf_color_detection import analyze_pdf_colors, calculate_page_costs

@csrf_exempt
def upload_pdf_view(request):
    if request.method == 'POST' and request.FILES.get('pdf'):
        pdf_file = request.FILES['pdf']
        paper_size = request.POST.get('paper_size', 'Letter')
        # Save uploaded file temporarily
        temp_path = os.path.join(settings.MEDIA_ROOT, 'temp_upload.pdf')
        with open(temp_path, 'wb+') as destination:
            for chunk in pdf_file.chunks():
                destination.write(chunk)
        # Analyze PDF
        try:
            site_settings = SiteSetting.load()
            color_results = analyze_pdf_colors(
                temp_path,
                full_color_threshold_percent=site_settings.color_full_threshold_percent,
            )
            total, costs = calculate_page_costs(
                color_results,
                paper_size=paper_size,
                letter_bw_price=site_settings.letter_bw_price,
                letter_partial_price=site_settings.letter_partial_price,
                letter_full_price=site_settings.letter_full_price,
                a4_bw_price=site_settings.a4_bw_price,
                a4_partial_price=site_settings.a4_partial_price,
                a4_full_price=site_settings.a4_full_price,
                long_bw_price=site_settings.long_bw_price,
                long_partial_price=site_settings.long_partial_price,
                long_full_price=site_settings.long_full_price,
            )
            os.remove(temp_path)
            return JsonResponse({
                'total_cost': total,
                'costs_per_page': costs,
                'color_results': color_results
            })
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return JsonResponse({'error': str(e)}, status=500)
    return render(request, 'upload.html')
