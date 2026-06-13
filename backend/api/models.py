from django.db import models
from django.contrib.auth.models import User

class Boitier(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='boitier')
    nom = models.CharField(max_length=100, default="Mon Boîtier")
    adresse_mac = models.CharField(max_length=50, blank=True, null=True)
    batterie = models.IntegerField(default=100)
    est_connecte = models.BooleanField(default=False)
    date_creation = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"{self.nom} - {self.user.username}"

class Medicament(models.Model):
    TYPE_CHOICES = [
        ('comprime', 'Comprimé'),
        ('effervescent', 'Effervescent'),
        ('sirop', 'Sirop'),
        ('suppositoire', 'Suppositoire'),
        ('capsule', 'Capsule'),
        ('injection', 'Injection'),
        ('autre', 'Autre'),
    ]
    # Champs existants
    nom = models.CharField(max_length=255)
    dosage = models.CharField(max_length=50, blank=True, null=True)
    type_medicament = models.CharField(max_length=20, choices=TYPE_CHOICES, default='comprime')
    contre_indications = models.TextField(blank=True, null=True)
    effets_secondaires = models.TextField(blank=True, null=True)
    instructions = models.TextField(blank=True, null=True)
    notice_json = models.JSONField(default=dict, blank=True)
    # Nouveaux champs pour l'import CIS
    code_cis = models.CharField(max_length=50, blank=True, null=True, unique=True)
    forme = models.CharField(max_length=100, blank=True)
    statut = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.nom} {self.dosage or ''}"

class Traitement(models.Model):
    PORT_CHOICES = [
        ('A', 'Port A'),
        ('B', 'Port B'),
    ]
    boitier = models.ForeignKey(Boitier, on_delete=models.CASCADE, related_name='traitements')
    port = models.CharField(max_length=1, choices=PORT_CHOICES)
    medicament = models.ForeignKey(Medicament, on_delete=models.CASCADE)
    horaires = models.JSONField(default=list)
    duree_totale = models.IntegerField(help_text="Durée en jours")
    date_debut = models.DateField()
    date_fin = models.DateField()
    jours_restants = models.IntegerField()
    est_actif = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"{self.boitier.user.username} - Port {self.port} - {self.medicament.nom}"

class Prise(models.Model):
    STATUT_CHOICES = [
        ('prise', 'Prise'),
        ('retard', 'Retard'),
        ('oublie', 'Oubliée'),
    ]
    traitement = models.ForeignKey(Traitement, on_delete=models.CASCADE, related_name='prises')
    horaire_prevue = models.TimeField()
    horaire_reelle = models.TimeField(null=True, blank=True)
    date_prise = models.DateField()
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='prise')
    class Meta:
        unique_together = ['traitement', 'date_prise', 'horaire_prevue']
    def __str__(self):
        return f"{self.traitement} - {self.date_prise} {self.horaire_prevue}"
class PortConfig(models.Model):
    PORT_CHOICES = [
        ('A', 'Port A'),
        ('B', 'Port B'),
    ]
    boitier = models.ForeignKey(Boitier, on_delete=models.CASCADE, related_name='port_configs')
    port = models.CharField(max_length=1, choices=PORT_CHOICES)
    config_json = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['boitier', 'port']

    def __str__(self):
        return f"{self.boitier.user.username} - Port {self.port}"