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
        gsm = int(request.POST.get('gsm', 70))  # Default to 70 GSM
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
                gsm=gsm,
                bw_price_70=site_settings.bw_price_70,
                bw_price_80=site_settings.bw_price_80,
                partial_color_price=site_settings.partial_color_price,
                full_color_price=site_settings.full_color_price,
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
