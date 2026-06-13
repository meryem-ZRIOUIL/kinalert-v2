import csv
from django.core.management.base import BaseCommand
from api.models import Medicament


class Command(BaseCommand):
    help = 'Importe les médicaments depuis le fichier CIS_bdpm.csv'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Chemin vers le fichier CIS_bdpm.csv')

    def handle(self, *args, **kwargs):
        filepath = kwargs['csv_file']
        count = 0
        errors = 0

        self.stdout.write(f'📂 Ouverture du fichier : {filepath}')

        try:
            with open(filepath, encoding='latin-1') as f:
                reader = csv.reader(f, delimiter='\t')
                for row in reader:
                    if len(row) < 2:
                        continue
                    try:
                        Medicament.objects.get_or_create(
                            code_cis=row[0].strip(),
                            defaults={
                                'nom': row[1].strip(),
                                'forme': row[2].strip() if len(row) > 2 else '',
                                'statut': row[6].strip() if len(row) > 6 else '',
                            }
                        )
                        count += 1

                        # Affiche la progression tous les 1000 médicaments
                        if count % 1000 == 0:
                            self.stdout.write(f'  ... {count} médicaments importés')

                    except Exception as e:
                        errors += 1
                        continue

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f'❌ Fichier introuvable : {filepath}'))
            return

        self.stdout.write(self.style.SUCCESS(f'✅ Import terminé ! {count} médicaments importés, {errors} erreurs.'))