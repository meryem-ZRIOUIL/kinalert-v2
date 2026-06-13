from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('config/', views.config_boitier, name='config'),
    path('historique/', views.historique, name='historique'),
    path('api/status/', views.api_status, name='api_status'),
    path('api/sauvegarder/', views.sauvegarder_configuration, name='api_sauvegarder'),
    path('api/historique/', views.api_historique, name='api_historique'),
    path('search/', views.search_medicaments, name='search_medicaments'),
    path('api/port-config/save/', views.sauvegarder_port_config, name='api_port_config_save'),
    path('api/port-config/load/', views.charger_port_configs, name='api_port_config_load')
]
