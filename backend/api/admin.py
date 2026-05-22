from django.contrib import admin
from .models import Boitier, Medicament, Traitement, Prise

admin.site.register(Boitier)
admin.site.register(Medicament)
admin.site.register(Traitement)
admin.site.register(Prise)