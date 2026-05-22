from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Boitier, Medicament, Traitement, Prise

# Pages publiques
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
    return render(request, 'api/user_dashboard.html')

@login_required
def config_boitier(request):
    return render(request, 'api/config.html')

@login_required
def historique(request):
    return render(request, 'api/historique.html')

# API endpoints
@api_view(['GET'])
def api_status(request):
    return Response({'status': 'ok', 'message': 'Kinalert API fonctionne'})
