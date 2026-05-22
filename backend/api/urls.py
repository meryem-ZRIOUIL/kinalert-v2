from django.urls import path
from . import views

urlpatterns = [
    # Pages
    path('', views.home, name='home'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('config/', views.config_boitier, name='config'),
    path('historique/', views.historique, name='historique'),
    
    # API
    path('api/status/', views.api_status, name='api_status'),
]
