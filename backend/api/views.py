from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Boitier, Medicament, Traitement, Prise
import json
from datetime import date, timedelta

def home(request):
    return render(request, 'api/home.html')

def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('dashboard')
    return render(request, 'api/login.html')

def register_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        user = User.objects.create_user(username=username, email=email, password=password)
        login(request, user)
        return redirect('dashboard')
    return render(request, 'api/register.html')

def logout_view(request):
    logout(request)
    return redirect('home')

@login_required
def dashboard(request):
    if request.user.is_superuser:
        return redirect('/admin/')
    return render(request, 'api/user_dashboard.html', {'user': request.user})

@login_required
def config_boitier(request):
    return render(request, 'api/config.html', {'user': request.user})

@login_required
def historique(request):
    return render(request, 'api/historique.html', {'user': request.user})

@api_view(['GET'])
def api_status(request):
    return Response({'status': 'ok', 'message': 'Kinalert API fonctionne'})

@csrf_exempt
@login_required
def sauvegarder_configuration(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    try:
        data = json.loads(request.body)
        medicament, _ = Medicament.objects.get_or_create(
            nom=data.get('medicament'),
            dosage=data.get('dosage', ''),
            type_medicament=data.get('type', 'comprime')
        )
        boitier, _ = Boitier.objects.get_or_create(
            user=request.user,
            defaults={'nom': 'Mon boîtier'}
        )
        date_debut = date.today()
        duree = int(data.get('duree', 7))
        date_fin = date_debut + timedelta(days=duree)
        traitement = Traitement.objects.create(
            boitier=boitier,
            port=data.get('port'),
            medicament=medicament,
            horaires=data.get('horaires', []),
            duree_totale=duree,
            date_debut=date_debut,
            date_fin=date_fin,
            jours_restants=duree,
            est_actif=True
        )
        return JsonResponse({'success': True, 'message': f'Traitement pour {data.get("medicament")} sauvegardé', 'traitement_id': traitement.id})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@login_required
def api_historique(request):
    from django.http import JsonResponse
    try:
        boitier = Boitier.objects.get(user=request.user)
    except Boitier.DoesNotExist:
        return JsonResponse({'prises': [], 'stats': {'total': 0, 'prises': 0, 'retards': 0, 'oublies': 0}})
    
    traitements = Traitement.objects.filter(boitier=boitier)
    prises_data = []
    for traitement in traitements:
        prises = Prise.objects.filter(traitement=traitement).order_by('-date_prise')
        for prise in prises:
            prises_data.append({
                'id': prise.id,
                'date': prise.date_prise.strftime('%Y-%m-%d'),
                'port': traitement.port,
                'medicament': traitement.medicament.nom,
                'dosage': traitement.medicament.dosage,
                'horaire_prevue': prise.horaire_prevue.strftime('%H:%M'),
                'horaire_reelle': prise.horaire_reelle.strftime('%H:%M') if prise.horaire_reelle else None,
                'statut': prise.statut,
            })
    
    total = len(prises_data)
    prises_count = len([p for p in prises_data if p['statut'] == 'prise'])
    retards = len([p for p in prises_data if p['statut'] == 'retard'])
    oublies = len([p for p in prises_data if p['statut'] == 'oublie'])
    
    return JsonResponse({
        'prises': prises_data,
        'stats': {'total': total, 'prises': prises_count, 'retards': retards, 'oublies': oublies}
    })
